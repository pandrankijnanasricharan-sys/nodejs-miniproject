/*
  FILESHRINK - TARGET SIZE FILE COMPRESSOR

  Flow:
  1. User selects a file.
  2. Browser immediately shows the original size.
  3. User enters the target size.
  4. Server tries to create an output at or below that target.
  5. The result page shows original size, target size and final size.

  Images:
    Sharp repeatedly tests different JPEG/WebP quality values and,
    when necessary, reduces dimensions to get close to the target.

  PDFs:
    pdf-lib re-saves/optimizes the PDF. A target size is attempted,
    but a PDF cannot always be reduced to an arbitrary target without
    changing its contents.

  Other files:
    Node's zlib Deflate is used. A target cannot be guaranteed because
    some files are already compressed.
*/

const express = require("express");
const multer = require("multer");
const compression = require("compression");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, "uploads");
const OUTPUT_DIR = path.join(ROOT, "outputs");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

app.use(compression());
app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".avif"
]);

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function safeOutputName(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function createOutputName(originalName, suffix, extension) {
  const safe = safeOutputName(originalName);
  const base = path.basename(safe, path.extname(safe));
  return `${base}-${suffix}${extension}`;
}

/*
  Try a range of image qualities and dimensions.

  We first search through quality values. If the target is still too large,
  we reduce the maximum dimension and try again.
*/
async function compressImageToTarget(inputPath, outputPath, targetBytes, originalExtension) {
  const ext = originalExtension.toLowerCase();

  // JPEG is used for TIFF/AVIF/PNG as a broadly compatible output.
  const outputExtension =
    ext === ".webp" ? ".webp" : ".jpg";

  let originalMetadata = await sharp(inputPath).metadata();
  let maxDimension = Math.min(
    2500,
    Math.max(originalMetadata.width || 1, originalMetadata.height || 1)
  );

  let bestBuffer = null;
  let bestSize = Infinity;

  // Try progressively smaller dimensions.
  for (let dimensionStep = 0; dimensionStep < 6; dimensionStep++) {
    const dimension = Math.max(320, Math.round(maxDimension * Math.pow(0.82, dimensionStep)));

    // Search from higher to lower quality.
    for (let quality = 95; quality >= 20; quality -= 5) {
      let image = sharp(inputPath).rotate().resize({
        width: dimension,
        height: dimension,
        fit: "inside",
        withoutEnlargement: true
      });

      let buffer;

      if (outputExtension === ".webp") {
        buffer = await image.webp({ quality }).toBuffer();
      } else {
        buffer = await image.jpeg({ quality, mozjpeg: true }).toBuffer();
      }

      // Keep the smallest version found, but prefer the largest version
      // that is still under the target.
      if (buffer.length < bestSize) {
        bestBuffer = buffer;
        bestSize = buffer.length;
      }

      if (buffer.length <= targetBytes) {
        fs.writeFileSync(outputPath, buffer);
        return {
          path: outputPath,
          size: buffer.length,
          achievedTarget: true,
          outputExtension
        };
      }
    }
  }

  // If the exact target could not be reached, save the smallest result found.
  fs.writeFileSync(outputPath, bestBuffer);
  return {
    path: outputPath,
    size: bestSize,
    achievedTarget: bestSize <= targetBytes,
    outputExtension
  };
}

async function optimizePdf(inputPath, outputPath) {
  const bytes = fs.readFileSync(inputPath);

  const pdfDoc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false
  });

  const optimizedBytes = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false
  });

  fs.writeFileSync(outputPath, optimizedBytes);
  return optimizedBytes.length;
}

function compressOtherFile(inputPath, outputPath) {
  const data = fs.readFileSync(inputPath);
  const compressed = zlib.deflateSync(data, { level: 9 });
  fs.writeFileSync(outputPath, compressed);
  return compressed.length;
}

app.post("/api/compress", upload.single("file"), async (req, res) => {
  let uploadedPath = null;
  let outputPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please select a file first." });
    }

    uploadedPath = req.file.path;

    const originalName = req.file.originalname;
    const extension = path.extname(originalName).toLowerCase();
    const originalSize = fs.statSync(uploadedPath).size;

    const targetValue = Number.parseFloat(req.body.targetValue);
    const targetUnit = req.body.targetUnit === "MB" ? "MB" : "KB";

    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      return res.status(400).json({ error: "Please enter a valid target size." });
    }

    const targetBytes = Math.floor(
      targetValue * (targetUnit === "MB" ? 1024 * 1024 : 1024)
    );

    if (targetBytes >= originalSize) {
      return res.status(400).json({
        error: "The target size must be smaller than the original file size."
      });
    }

    const id = crypto.randomBytes(8).toString("hex");
    let outputName;
    let outputType;
    let achievedTarget = false;
    let compressedSize;

    if (IMAGE_EXTENSIONS.has(extension)) {
      outputName = createOutputName(originalName, "compressed", extension === ".webp" ? ".webp" : ".jpg");
      outputPath = path.join(OUTPUT_DIR, `${id}-${outputName}`);

      const imageResult = await compressImageToTarget(
        uploadedPath,
        outputPath,
        targetBytes,
        extension
      );

      outputPath = imageResult.path;
      compressedSize = imageResult.size;
      achievedTarget = imageResult.achievedTarget;
      outputType = "Target-sized compressed image";
    } else if (extension === ".pdf") {
      outputName = createOutputName(originalName, "optimized", ".pdf");
      outputPath = path.join(OUTPUT_DIR, `${id}-${outputName}`);

      compressedSize = await optimizePdf(uploadedPath, outputPath);
      achievedTarget = compressedSize <= targetBytes;
      outputType = "Optimized PDF";
    } else {
      outputName = `${safeOutputName(originalName)}.deflate`;
      outputPath = path.join(OUTPUT_DIR, `${id}-${outputName}`);

      compressedSize = compressOtherFile(uploadedPath, outputPath);
      achievedTarget = compressedSize <= targetBytes;
      outputType = "Deflate compressed file";
    }

    const reduction = ((originalSize - compressedSize) / originalSize) * 100;

    return res.json({
      success: true,
      originalName,
      originalSize,
      originalSizeFormatted: formatBytes(originalSize),
      targetBytes,
      targetSizeFormatted: formatBytes(targetBytes),
      compressedSize,
      compressedSizeFormatted: formatBytes(compressedSize),
      reduction: Number(Math.max(0, reduction).toFixed(2)),
      achievedTarget,
      outputType,
      resultId: path.basename(outputPath)
    });
  } catch (error) {
    console.error(error);

    if (outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    return res.status(500).json({
      error:
        "The file could not be compressed. It may be encrypted, corrupted, unsupported, or already highly compressed."
    });
  } finally {
    if (uploadedPath && fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }
  }
});

app.get("/api/download/:file", (req, res) => {
  const requested = path.basename(req.params.file);
  const filePath = path.join(OUTPUT_DIR, requested);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Compressed file not found.");
  }

  res.download(filePath, requested);
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "FileShrink server is running." });
});

app.listen(PORT, () => {
  console.log(`FileShrink running at http://localhost:${PORT}`);
});
