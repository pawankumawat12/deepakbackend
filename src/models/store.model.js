const db = require("../../config/db");
const crypto = require("crypto");

const STORES_TABLE = "stores";
const STORE_CATEGORIES_TABLE = "store_categories";
const STORE_LOGIN_REQUESTS_TABLE = "store_login_requests";
const USERS_TABLE = "users";

function generateSlug(name) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

let columnsChecked = false;
async function ensureStoreColumns() {
  if (columnsChecked) return;
  try {
    await db.raw(`
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255),
        owner_id INTEGER,
        phone VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100) DEFAULT 'Rajasthan',
        pincode VARCHAR(20),
        latitude NUMERIC(10, 8),
        longitude NUMERIC(11, 8),
        is_open BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE stores ADD COLUMN IF NOT EXISTS owner_id INTEGER;
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS email VARCHAR(255);
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS city VARCHAR(100);
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS state VARCHAR(100) DEFAULT 'Rajasthan';
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS pincode VARCHAR(20);
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8);
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8);
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT TRUE;
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

      CREATE TABLE IF NOT EXISTS store_categories (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS store_login_requests (
        id SERIAL PRIMARY KEY,
        store_id INTEGER,
        user_id INTEGER,
        email VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        approved_by INTEGER,
        setup_token VARCHAR(255),
        setup_token_expires_at TIMESTAMPTZ,
        approved_at TIMESTAMPTZ,
        rejection_reason TEXT,
        permissions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE store_login_requests ADD COLUMN IF NOT EXISTS approved_by INTEGER;
      ALTER TABLE store_login_requests ADD COLUMN IF NOT EXISTS setup_token VARCHAR(255);
      ALTER TABLE store_login_requests ADD COLUMN IF NOT EXISTS setup_token_expires_at TIMESTAMPTZ;
      ALTER TABLE store_login_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
      ALTER TABLE store_login_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
      ALTER TABLE store_login_requests ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS auto_forward_orders BOOLEAN DEFAULT FALSE;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id INTEGER;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id INTEGER;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_forwarded_to_store BOOLEAN DEFAULT FALSE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS forwarded_at TIMESTAMPTZ;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS store_id INTEGER;
    `);

    columnsChecked = true;
  } catch (err) {
    console.warn("[Store Model] Schema self-heal notice:", err.message);
  }
}

async function createStoreWithOwner({ storeData, ownerData, categoryIds = [] }) {
  await ensureStoreColumns();
  return await db.transaction(async (trx) => {
    // 1. Check if owner email already registered
    const existingUser = await trx(USERS_TABLE)
      .whereRaw("LOWER(email) = ?", [ownerData.email.trim().toLowerCase()])
      .first();

    if (existingUser) {
      const error = new Error("A user with this email address is already registered.");
      error.statusCode = 400;
      throw error;
    }

    // Check if owner phone already registered in users
    if (ownerData.phone) {
      const existingUserPhone = await trx(USERS_TABLE)
        .where({ phone: ownerData.phone.trim() })
        .first();
      if (existingUserPhone) {
        const error = new Error("A user with this owner phone number is already registered.");
        error.statusCode = 400;
        throw error;
      }
    }

    // Check if store business email already registered in stores
    if (storeData.email) {
      const existingStoreEmail = await trx(STORES_TABLE)
        .whereRaw("LOWER(email) = ?", [storeData.email.trim().toLowerCase()])
        .first();
      if (existingStoreEmail) {
        const error = new Error("A store with this business email is already registered.");
        error.statusCode = 400;
        throw error;
      }
    }

    // Check if store business phone already registered in stores
    if (storeData.phone) {
      const existingStorePhone = await trx(STORES_TABLE)
        .where({ phone: storeData.phone.trim() })
        .first();
      if (existingStorePhone) {
        const error = new Error("A store with this business phone number is already registered.");
        error.statusCode = 400;
        throw error;
      }
    }

    // 2. Create the store owner user (password null, is_active false until password set)
    const [user] = await trx(USERS_TABLE)
      .insert({
        name: ownerData.name.trim(),
        email: ownerData.email.trim().toLowerCase(),
        phone: ownerData.phone ? String(ownerData.phone).trim() : null,
        role: "store_owner",
        password: null,
        is_active: false,
        is_email_verified: true,
      })
      .returning(["id", "name", "email", "phone", "role", "is_active"]);

    // 3. Create store
    const slug = storeData.slug || generateSlug(storeData.name);
    const [store] = await trx(STORES_TABLE)
      .insert({
        name: storeData.name.trim(),
        slug,
        owner_id: user.id,
        phone: storeData.phone || ownerData.phone || null,
        email: storeData.email || ownerData.email || null,
        address: storeData.address || null,
        city: storeData.city || null,
        state: storeData.state || "Rajasthan",
        pincode: storeData.pincode || null,
        latitude: storeData.latitude || null,
        longitude: storeData.longitude || null,
        is_open: storeData.is_open !== false,
        is_active: true,
      })
      .returning("*");

    // 4. Associate store_id with user
    await trx(USERS_TABLE).where({ id: user.id }).update({ store_id: store.id });

    // 5. Assign categories
    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const rows = categoryIds.map((catId) => ({
        store_id: store.id,
        category_id: Number(catId),
      }));
      await trx(STORE_CATEGORIES_TABLE).insert(rows);
    }

    return { store, user };
  });
}

async function listStores({ search = "", is_open, is_active, page = 1, limit = 50 } = {}) {
  await ensureStoreColumns();
  let query = db(`${STORES_TABLE} as s`)
    .leftJoin(`${USERS_TABLE} as u`, "s.owner_id", "u.id")
    .select(
      "s.*",
      "u.name as owner_name",
      "u.email as owner_email",
      "u.phone as owner_phone",
      "u.is_active as owner_is_active",
      db.raw(`
        COALESCE((SELECT COUNT(id)::int FROM orders WHERE store_id = s.id), 0) as total_orders
      `),
      db.raw(`
        COALESCE((SELECT SUM(total_amount)::float FROM orders WHERE store_id = s.id), 0) as total_revenue
      `),
      db.raw(`
        COALESCE((SELECT COUNT(id)::int FROM products WHERE store_id = s.id), 0) as total_products
      `),
      db.raw(`
        COALESCE((
          SELECT json_agg(
            json_build_object(
              'id', c.id,
              'name', c.name
            )
          )
          FROM ${STORE_CATEGORIES_TABLE} sc
          JOIN categories c ON sc.category_id = c.id
          WHERE sc.store_id = s.id
        ), '[]'::json) as assigned_categories
      `)
    )
    .orderBy("s.created_at", "desc");

  if (search) {
    const s = `%${search.toLowerCase()}%`;
    query = query.where((b) => {
      b.whereRaw("LOWER(s.name) LIKE ?", [s])
        .orWhereRaw("LOWER(s.city) LIKE ?", [s])
        .orWhereRaw("LOWER(u.name) LIKE ?", [s])
        .orWhereRaw("LOWER(u.email) LIKE ?", [s]);
    });
  }

  if (typeof is_open === "boolean") {
    query = query.where("s.is_open", is_open);
  }
  if (typeof is_active === "boolean") {
    query = query.where("s.is_active", is_active);
  }

  // Count total records for pagination
  const countQuery = query.clone().clearSelect().clearOrder().count("s.id as total").first();
  const countRes = await countQuery;
  const total = parseInt(countRes?.total || 0, 10);
  const totalPages = Math.ceil(total / limit) || 1;

  const offset = (page - 1) * limit;
  query = query.limit(limit).offset(offset);

  const stores = await query;
  return {
    stores,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages,
    },
  };
}

async function getStoreById(id) {
  await ensureStoreColumns();
  const store = await db(`${STORES_TABLE} as s`)
    .leftJoin(`${USERS_TABLE} as u`, "s.owner_id", "u.id")
    .select(
      "s.*",
      "u.name as owner_name",
      "u.email as owner_email",
      "u.phone as owner_phone",
      "u.is_active as owner_is_active",
      db.raw(`
        COALESCE((SELECT COUNT(id)::int FROM orders WHERE store_id = s.id), 0) as total_orders
      `),
      db.raw(`
        COALESCE((SELECT SUM(total_amount)::float FROM orders WHERE store_id = s.id), 0) as total_revenue
      `),
      db.raw(`
        COALESCE((SELECT COUNT(id)::int FROM products WHERE store_id = s.id), 0) as total_products
      `),
      db.raw(`
        COALESCE((
          SELECT json_agg(
            json_build_object(
              'id', c.id,
              'name', c.name
            )
          )
          FROM ${STORE_CATEGORIES_TABLE} sc
          JOIN categories c ON sc.category_id = c.id
          WHERE sc.store_id = s.id
        ), '[]'::json) as assigned_categories
      `)
    )
    .where("s.id", id)
    .first();

  return store || null;
}

async function getStoreByOwnerId(ownerId) {
  await ensureStoreColumns();
  const store = await db(`${STORES_TABLE} as s`)
    .leftJoin(`${USERS_TABLE} as u`, "s.owner_id", "u.id")
    .select(
      "s.*",
      "u.name as owner_name",
      "u.email as owner_email",
      "u.phone as owner_phone",
      db.raw(`
        COALESCE((
          SELECT json_agg(
            json_build_object(
              'id', c.id,
              'name', c.name
            )
          )
          FROM ${STORE_CATEGORIES_TABLE} sc
          JOIN categories c ON sc.category_id = c.id
          WHERE sc.store_id = s.id
        ), '[]'::json) as assigned_categories
      `)
    )
    .where("s.owner_id", ownerId)
    .first();

  return store || null;
}

async function updateStore(id, storeData, categoryIds) {
  await ensureStoreColumns();
  return await db.transaction(async (trx) => {
    if (storeData.email) {
      const existingEmail = await trx(STORES_TABLE)
        .whereRaw("LOWER(email) = ?", [storeData.email.trim().toLowerCase()])
        .whereNot({ id })
        .first();
      if (existingEmail) {
        const error = new Error("Another store with this business email already exists.");
        error.statusCode = 400;
        throw error;
      }
    }

    if (storeData.phone) {
      const existingPhone = await trx(STORES_TABLE)
        .where({ phone: storeData.phone.trim() })
        .whereNot({ id })
        .first();
      if (existingPhone) {
        const error = new Error("Another store with this business phone number already exists.");
        error.statusCode = 400;
        throw error;
      }
    }

    const updatePayload = { ...storeData, updated_at: new Date() };
    delete updatePayload.id;
    delete updatePayload.owner_id;
    delete updatePayload.created_at;

    const [updated] = await trx(STORES_TABLE)
      .where({ id })
      .update(updatePayload)
      .returning("*");

    if (Array.isArray(categoryIds)) {
      await trx(STORE_CATEGORIES_TABLE).where({ store_id: id }).del();
      if (categoryIds.length > 0) {
        const rows = categoryIds.map((catId) => ({
          store_id: id,
          category_id: Number(catId),
        }));
        await trx(STORE_CATEGORIES_TABLE).insert(rows);
      }
    }

    if (storeData.is_active !== undefined && updated?.owner_id) {
      await trx(USERS_TABLE)
        .where({ id: updated.owner_id })
        .update({ is_active: Boolean(storeData.is_active), updated_at: new Date() });
    }

    return updated;
  });
}

async function toggleStoreOpenStatus(id, isOpen) {
  const [updated] = await db(STORES_TABLE)
    .where({ id })
    .update({ is_open: Boolean(isOpen), updated_at: new Date() })
    .returning(["id", "name", "is_open"]);
  return updated;
}

async function toggleStoreAutoForward(id, autoForward) {
  const [updated] = await db(STORES_TABLE)
    .where({ id })
    .update({ auto_forward_orders: Boolean(autoForward), updated_at: new Date() })
    .returning(["id", "name", "auto_forward_orders"]);
  return updated;
}

async function deleteStore(id) {
  await ensureStoreColumns();

  return db.transaction(async (trx) => {
    const store = await trx(STORES_TABLE)
      .where({ id })
      .forUpdate()
      .first();

    if (!store) {
      const error = new Error("Store not found.");
      error.statusCode = 404;
      throw error;
    }

    const productIds = await trx("products").where({ store_id: id }).pluck("id");

    if (productIds.length > 0) {
      // Remove dependent customer/recipe rows and retain completed-order
      // snapshots by clearing their deleted product references.
      await trx("cart_items").whereIn("product_id", productIds).del();
      await trx("wishlist_items").whereIn("product_id", productIds).del();
      await trx("product_ingredients").whereIn("product_id", productIds).del();
      await trx("reviews").whereIn("product_id", productIds).update({ product_id: null });
      await trx("order_items").whereIn("product_id", productIds).update({ product_id: null, store_id: null });
      await trx("products").whereIn("id", productIds).del();
    }

    await trx(STORE_CATEGORIES_TABLE).where({ store_id: id }).del();
    await trx(STORE_LOGIN_REQUESTS_TABLE).where({ store_id: id }).del();
    await trx("orders").where({ store_id: id }).update({ store_id: null, is_forwarded_to_store: false });
    await trx("order_items").where({ store_id: id }).update({ store_id: null });
    await trx(USERS_TABLE).where({ store_id: id }).update({ store_id: null });

    // Revoke the former owner's session so a deleted branch cannot continue
    // using an already-issued access or refresh token.
    if (store.owner_id) {
      await trx(USERS_TABLE)
        .where({ id: store.owner_id })
        .update({ is_active: false, access_token: null, store_id: null, updated_at: new Date() });
    }

    await trx(STORES_TABLE).where({ id }).del();

    return { id: store.id, ownerId: store.owner_id, deletedProducts: productIds.length };
  });
}

async function getStoreCategories(storeId) {
  return await db(`${STORE_CATEGORIES_TABLE} as sc`)
    .join("categories as c", "sc.category_id", "c.id")
    .where("sc.store_id", storeId)
    .select("c.id", "c.name", "c.image");
}

// ----------------- STORE LOGIN REQUESTS & ACCESS APPROVAL -----------------

async function createStoreLoginRequest({ storeId, userId, email }) {
  // Check if there is already an active pending request
  const existing = await db(STORE_LOGIN_REQUESTS_TABLE)
    .where({ user_id: userId, status: "pending" })
    .first();

  if (existing) {
    return existing;
  }

  const [req] = await db(STORE_LOGIN_REQUESTS_TABLE)
    .insert({
      store_id: storeId,
      user_id: userId,
      email: email.trim().toLowerCase(),
      status: "pending",
    })
    .returning("*");

  return req;
}

async function listStoreLoginRequests({ status = "all", page = 1, limit = 10, search = "" } = {}) {
  await ensureStoreColumns();
  let query = db(`${STORE_LOGIN_REQUESTS_TABLE} as slr`)
    .leftJoin(`${STORES_TABLE} as s`, "slr.store_id", "s.id")
    .leftJoin(`${USERS_TABLE} as u`, "slr.user_id", "u.id")
    .select(
      "slr.*",
      "s.name as store_name",
      "s.slug as store_slug",
      "s.city as store_city",
      "s.address as store_address",
      "s.phone as store_phone",
      "s.email as store_email",
      "s.is_open as store_is_open",
      "s.is_active as store_is_active",
      "u.name as owner_name",
      "u.email as owner_email",
      "u.phone as owner_phone",
      "u.is_active as owner_is_active",
      db.raw(`
        COALESCE((
          SELECT json_agg(
            json_build_object(
              'id', c.id,
              'name', c.name
            )
          )
          FROM ${STORE_CATEGORIES_TABLE} sc
          JOIN categories c ON sc.category_id = c.id
          WHERE sc.store_id = s.id
        ), '[]'::json) as assigned_categories
      `)
    )
    .orderBy("slr.created_at", "desc");

  if (status && status !== "all") {
    query = query.where("slr.status", status);
  }

  if (search && search.trim()) {
    const s = `%${search.trim().toLowerCase()}%`;
    query = query.where((b) => {
      b.whereRaw("LOWER(slr.email) LIKE ?", [s])
        .orWhereRaw("LOWER(s.name) LIKE ?", [s])
        .orWhereRaw("LOWER(u.name) LIKE ?", [s])
        .orWhereRaw("LOWER(u.email) LIKE ?", [s]);
    });
  }

  // Count total for pagination
  const countQuery = query.clone().clearSelect().clearOrder().count("slr.id as total").first();
  const countRes = await countQuery;
  const total = parseInt(countRes?.total || 0, 10);
  const totalPages = Math.ceil(total / limit) || 1;

  if (page && limit) {
    const offset = (page - 1) * limit;
    query = query.limit(limit).offset(offset);
  }

  const requests = await query;
  return {
    requests,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages,
    },
  };
}

async function findStoreLoginRequestById(id) {
  await ensureStoreColumns();
  return await db(`${STORE_LOGIN_REQUESTS_TABLE} as slr`)
    .leftJoin(`${STORES_TABLE} as s`, "slr.store_id", "s.id")
    .leftJoin(`${USERS_TABLE} as u`, "slr.user_id", "u.id")
    .select(
      "slr.*",
      "s.name as store_name",
      "s.owner_id as store_owner_id",
      "u.name as owner_name",
      "u.email as owner_email",
      "u.phone as owner_phone"
    )
    .where("slr.id", id)
    .first();
}

async function approveStoreLoginRequest(requestId, adminId, setupToken, expiresAt, permissions) {
  await ensureStoreColumns();
  const updateData = {
    status: "approved",
    approved_by: adminId ? Number(adminId) : null,
    setup_token: setupToken,
    setup_token_expires_at: expiresAt,
    approved_at: new Date(),
    updated_at: new Date(),
  };

  if (permissions !== undefined) {
    updateData.permissions =
      typeof permissions === "string" ? permissions : JSON.stringify(permissions);
  }

  const [updated] = await db(STORE_LOGIN_REQUESTS_TABLE)
    .where({ id: requestId })
    .update(updateData)
    .returning("*");

  return updated;
}

async function rejectStoreLoginRequest(requestId, adminId, reason) {
  await ensureStoreColumns();
  const updateData = {
    status: "rejected",
    approved_by: adminId ? Number(adminId) : null,
    updated_at: new Date(),
  };

  if (reason) {
    updateData.rejection_reason = reason;
  }

  const [updated] = await db(STORE_LOGIN_REQUESTS_TABLE)
    .where({ id: requestId })
    .update(updateData)
    .returning("*");

  return updated;
}

async function findRequestBySetupToken(token) {
  if (!token) return null;
  return await db(`${STORE_LOGIN_REQUESTS_TABLE} as slr`)
    .join(`${STORES_TABLE} as s`, "slr.store_id", "s.id")
    .join(`${USERS_TABLE} as u`, "slr.user_id", "u.id")
    .select(
      "slr.*",
      "s.name as store_name",
      "u.name as owner_name",
      "u.email as owner_email",
      "u.id as owner_user_id"
    )
    .where("slr.setup_token", token)
    .where("slr.setup_token_expires_at", ">", new Date())
    .where("slr.status", "approved")
    .first();
}

async function completePasswordSetup(userId, requestId, hashedPassword) {
  return await db.transaction(async (trx) => {
    // 1. Update user password and activate
    const [user] = await trx(USERS_TABLE)
      .where({ id: userId })
      .update({
        password: hashedPassword,
        is_active: true,
        is_email_verified: true,
        updated_at: new Date(),
      })
      .returning(["id", "name", "email", "role", "store_id", "is_active"]);

    // 2. Clear token from request
    await trx(STORE_LOGIN_REQUESTS_TABLE)
      .where({ id: requestId })
      .update({
        setup_token: null,
        updated_at: new Date(),
      });

    return user;
  });
}

module.exports = {
  createStoreWithOwner,
  listStores,
  getStoreById,
  getStoreByOwnerId,
  updateStore,
  toggleStoreOpenStatus,
  toggleStoreAutoForward,
  deleteStore,
  getStoreCategories,
  createStoreLoginRequest,
  listStoreLoginRequests,
  findStoreLoginRequestById,
  approveStoreLoginRequest,
  rejectStoreLoginRequest,
  findRequestBySetupToken,
  completePasswordSetup,
};
