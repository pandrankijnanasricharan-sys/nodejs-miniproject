# FileShrink - Target Size Node.js File Compressor

## Project idea

FileShrink lets the user decide how small the output file should be.

The main user experience is:

```text
Select File
     ↓
Original size appears immediately
     ↓
Enter target size
     ↓
Compress
     ↓
Compare Original / Target / Final size
     ↓
Download
```

## Example

Suppose the user selects a 10 MB image.

The application immediately displays:

```text
Original size: 10 MB
```

The user can enter:

```text
Target size: 2 MB
```

The server then tries different image qualities and dimensions until it finds an image at or below 2 MB.

## Technologies

- Node.js
- Express.js
- HTML
- CSS
- JavaScript
- Multer
- Sharp
- pdf-lib
- zlib

## File types

### Images

JPG, JPEG, PNG, WEBP, TIFF and AVIF are supported.

For images, Sharp performs actual recompression.

The server tries multiple combinations of:

- image dimensions
- JPEG/WebP quality

until the target is reached or the smallest practical result is found.

### PDF

PDF files are re-saved with pdf-lib.

The target is checked after optimization.

However, a PDF cannot always be reduced to an arbitrary target without changing its content. For example, a PDF containing already-compressed images may not shrink much.

### Other files

For files such as TXT, CSV, DOCX, XLSX and PPTX, the project uses Node's built-in Deflate compression.

The output has a `.deflate` extension.

DOCX, XLSX and PPTX are already ZIP-based formats, so they may not become smaller.

## Folder structure

```text
node-file-compressor/
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── uploads/
│   └── .gitkeep
│
├── outputs/
│   └── .gitkeep
│
├── package.json
├── server.js
└── README.md
```

## Installation

Open the project folder in VS Code:

```bash
npm install
```

## Run

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Main API

### POST /api/compress

Receives:

- `file`
- `targetValue`
- `targetUnit`

The server compresses the file and returns:

- original size
- target size
- final size
- percentage reduction
- whether the target was achieved
- download identifier

### GET /api/download/:file

Downloads the generated compressed file.

### GET /api/health

Checks whether the server is running.

## Important concepts for viva

### What is compression?

Compression reduces the number of bytes required to store data.

### Why does the user choose a target size?

Different users have different requirements. For example, a website may require an image below 500 KB, while an email attachment may have another limit.

### How does the application know the original size?

The browser's JavaScript reads:

```js
selectedFile.size
```

The value is measured in bytes.

### How is the target converted?

For KB:

```text
target bytes = target KB × 1024
```

For MB:

```text
target bytes = target MB × 1024 × 1024
```

### How does image target compression work?

The server repeatedly creates versions using different quality and dimension values.

Conceptually:

```text
Quality 95
   ↓ too large
Quality 90
   ↓ too large
Quality 85
   ↓ too large
...
   ↓
Target reached
```

If quality alone is not enough, the image dimensions are reduced and the search continues.

### Can every file be compressed to exactly the requested size?

No.

Compression depends on the data.

Some files are already compressed, and forcing them to a very small size could require losing information or changing the file's contents.

Therefore the application treats the target as a goal.

## Future improvements

- Multiple file upload
- ZIP download containing multiple compressed files
- Drag and drop
- Progress bar
- Image before/after preview
- More advanced PDF compression
- Video compression
- Authentication
- Cloud storage
- Automatic cleanup
- Compression history
