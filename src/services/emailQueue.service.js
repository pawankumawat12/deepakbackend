const db = require("../../config/db");
const { sendMail } = require("./resend.service");
const { renderEmailTemplate } = require("./emailTemplate.service");

const MAX_CONCURRENT_JOBS = 2;
const RETRY_BACKOFF_BASE_MS = 30 * 1000; // 30 seconds * attempt number
const POLL_INTERVAL_MS = 15 * 1000; // 15 seconds

let activeWorkers = 0;
let pollTimer = null;
let isStopping = false;

/**
 * Enqueue an email job into the database queue.
 * Returns immediately with the job ID so API responses are never blocked by SMTP.
 */
async function enqueueEmail({
  to,
  templateSlug = null,
  variables = {},
  subject = null,
  html = null,
  text = null,
  emailType = "general",
  userId = null,
  metadata = null,
  maxAttempts = 3,
}) {
  if (!to || typeof to !== "string") {
    throw new Error("Recipient email address is required to enqueue email.");
  }

  const normalizedTo = to.trim().toLowerCase();
  const normalizedType = emailType || (templateSlug ? templateSlug.replace(/-/g, "_") : "general");

  const [job] = await db("email_queue")
    .insert({
      recipient: normalizedTo,
      template_slug: templateSlug || null,
      email_type: normalizedType,
      subject: subject || null,
      body_html: html || null,
      body_text: text || null,
      variables: variables ? JSON.stringify(variables) : null,
      user_id: userId ? Number(userId) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      status: "pending",
      attempts: 0,
      max_attempts: Math.max(1, Number(maxAttempts) || 3),
      next_attempt_at: db.fn.now(),
    })
    .returning("*");

  // Trigger background processor immediately on next tick
  triggerWorker();

  return {
    success: true,
    queued: true,
    jobId: job.id,
    recipient: job.recipient,
    emailType: job.email_type,
  };
}

/**
 * Trigger worker loop on next tick
 */
function triggerWorker() {
  if (isStopping) return;
  setImmediate(() => {
    processQueue().catch((err) => {
      console.error("[EmailQueue] Process loop error:", err);
    });
  });
}

/**
 * Main queue processing loop using PostgreSQL FOR UPDATE SKIP LOCKED
 */
async function processQueue() {
  if (isStopping) return;
  if (activeWorkers >= MAX_CONCURRENT_JOBS) return;

  const availableSlots = MAX_CONCURRENT_JOBS - activeWorkers;
  if (availableSlots <= 0) return;

  let jobs = [];
  try {
    // Transactionally acquire pending jobs using FOR UPDATE SKIP LOCKED
    jobs = await db.transaction(async (trx) => {
      const selected = await trx("email_queue")
        .where("status", "pending")
        .andWhere("next_attempt_at", "<=", trx.fn.now())
        .andWhere("attempts", "<", trx.raw("max_attempts"))
        .orderBy("id", "asc")
        .limit(availableSlots)
        .forUpdate()
        .skipLocked();

      if (selected.length > 0) {
        const ids = selected.map((j) => j.id);
        await trx("email_queue")
          .whereIn("id", ids)
          .update({
            status: "processing",
            updated_at: trx.fn.now(),
          });
      }

      return selected;
    });
  } catch (err) {
    console.error("[EmailQueue] Job fetch/lock error:", err.message);
    return;
  }

  if (!jobs || jobs.length === 0) return;

  // Process selected jobs concurrently up to MAX_CONCURRENT_JOBS
  for (const job of jobs) {
    activeWorkers++;
    processSingleJob(job)
      .catch((err) => {
        console.error(`[EmailQueue] Unexpected error processing job #${job.id}:`, err);
      })
      .finally(() => {
        activeWorkers = Math.max(0, activeWorkers - 1);
        // If more work might be available, trigger again
        triggerWorker();
      });
  }
}

/**
 * Process a single email job: renders template (if needed) and sends via SMTP
 */
async function processSingleJob(job) {
  let resolvedSubject = job.subject;
  let resolvedHtml = job.body_html;
  let resolvedText = job.body_text;
  let resolvedEmailType = job.email_type;

  const variables =
    typeof job.variables === "string"
      ? JSON.parse(job.variables)
      : job.variables || {};

  const metadata =
    typeof job.metadata === "string"
      ? JSON.parse(job.metadata)
      : job.metadata || null;

  try {
    // 1. If template_slug is specified, render it dynamically
    if (job.template_slug) {
      const rendered = await renderEmailTemplate(job.template_slug, variables);
      resolvedSubject = resolvedSubject || rendered.subject;
      resolvedHtml = rendered.html;
      resolvedText = rendered.text;
      resolvedEmailType = resolvedEmailType || job.template_slug;
    }

    if (!resolvedSubject) {
      resolvedSubject = "Notification from SFC Bakers";
    }

    // 2. Send via SMTP
    await sendMail({
      to: job.recipient,
      subject: resolvedSubject,
      text: resolvedText,
      html: resolvedHtml,
      emailType: resolvedEmailType,
      userId: job.user_id,
      metadata,
    });

    // 3. Mark completed on success
    await db("email_queue")
      .where({ id: job.id })
      .update({
        status: "completed",
        subject: resolvedSubject,
        body_html: resolvedHtml,
        body_text: resolvedText,
        processed_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

    console.log(`[EmailQueue] Successfully delivered email job #${job.id} to ${job.recipient} (${resolvedEmailType})`);
  } catch (err) {
    const nextAttempts = Number(job.attempts || 0) + 1;
    const isExhausted = nextAttempts >= Number(job.max_attempts || 3);
    const errorMessage = err.message || "Unknown SMTP error";

    if (isExhausted) {
      await db("email_queue")
        .where({ id: job.id })
        .update({
          status: "failed",
          attempts: nextAttempts,
          last_error: errorMessage,
          processed_at: db.fn.now(),
          updated_at: db.fn.now(),
        });
      console.error(
        `[EmailQueue] Job #${job.id} to ${job.recipient} permanently failed after ${nextAttempts} attempts: ${errorMessage}`
      );
    } else {
      const retryDelayMs = nextAttempts * RETRY_BACKOFF_BASE_MS;
      const nextAttemptAt = new Date(Date.now() + retryDelayMs);

      await db("email_queue")
        .where({ id: job.id })
        .update({
          status: "pending",
          attempts: nextAttempts,
          last_error: errorMessage,
          next_attempt_at: nextAttemptAt,
          updated_at: db.fn.now(),
        });

      console.warn(
        `[EmailQueue] Job #${job.id} to ${job.recipient} failed (attempt ${nextAttempts}/${job.max_attempts}): ${errorMessage}. Retrying in ${retryDelayMs / 1000}s.`
      );
    }
  }
}

/**
 * Start the background poller worker
 */
function startEmailQueueWorker() {
  if (pollTimer) return;
  isStopping = false;

  console.log("[EmailQueue] Background email queue worker started.");

  // Run immediate check for pending jobs on startup
  triggerWorker();

  // Periodic poll for scheduled retries
  pollTimer = setInterval(() => {
    triggerWorker();
  }, POLL_INTERVAL_MS);

  if (pollTimer && typeof pollTimer.unref === "function") {
    pollTimer.unref();
  }
}

/**
 * Stop background worker gracefully
 */
async function stopEmailQueueWorker() {
  isStopping = true;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  // Wait briefly if workers are active
  const startWait = Date.now();
  while (activeWorkers > 0 && Date.now() - startWait < 5000) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

module.exports = {
  enqueueEmail,
  startEmailQueueWorker,
  stopEmailQueueWorker,
  processQueue,
  triggerWorker,
};
