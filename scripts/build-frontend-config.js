const fs = require("fs");
const path = require("path");

const backendUrl = String(process.env.JANSEVAK_BACKEND_URL || "").trim().replace(/\/+$/, "");
const outputPath = path.join(__dirname, "..", "frontend", "env.js");

const contents = `window.JANSEVAK_BACKEND_URL = ${JSON.stringify(backendUrl)};\n`;

fs.writeFileSync(outputPath, contents, "utf8");
console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
