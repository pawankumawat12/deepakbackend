const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Keep uploads in one predictable location regardless of where `node` is run.
const uploadDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed extensions whitelist
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
]);

const ALLOWED_DOC_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".csv",
  ".zip",
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize extension and generate unguessable unique file name
    const rawExt = path.extname(file.originalname || "").toLowerCase();
    const safeExt = rawExt.replace(/[^a-z0-9.]/g, "") || ".dat";
    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${safeExt}`;

    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
  ];
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, JPEG, PNG, and WEBP image files are allowed."));
  }
};

const chatFileFilter = (req, file, cb) => {
  const allowedImageMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
    "image/gif",
  ];
  const allowedDocMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/x-zip-compressed",
  ];

  const ext = path.extname(file.originalname || "").toLowerCase();
  const isImage =
    allowedImageMimeTypes.includes(file.mimetype) &&
    ALLOWED_IMAGE_EXTENSIONS.has(ext);
  const isDoc =
    allowedDocMimeTypes.includes(file.mimetype) &&
    ALLOWED_DOC_EXTENSIONS.has(ext);

  if (isImage || isDoc) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Supported file formats: JPG, PNG, WEBP, GIF, PDF, DOC, DOCX, XLS, XLSX, TXT, CSV, ZIP"
      )
    );
  }
};

const uploadImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
});

const uploadChatAttachment = multer({
  storage,
  fileFilter: chatFileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max
  },
});

module.exports = {
  uploadImage,
  uploadChatAttachment,
};
