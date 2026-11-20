// Official Mozilla generic distribution, minus source maps and the sample PDF.
// https://github.com/mozilla/pdf.js/releases/tag/v5.4.624
// Upstream ZIP SHA-256: 1f900c34bb66551989fab363271bd9edf13b12e13dec19a663c93f1dcc2499fd
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const source = import.meta.dirname;
const output = "public/pdf-preview";
mkdirSync(output, { recursive: true });
execFileSync("tar", [
  "--no-same-owner",
  "-xmzf",
  join(source, "pdfjs-5.4.624.tar.gz"),
  "-C",
  output,
]);
const web = join(output, "web");
for (const file of ["preview.js", "preview.css"]) {
  copyFileSync(join(source, file), join(web, file));
}
const html = join(web, "viewer.html");
writeFileSync(
  html,
  readFileSync(html, "utf8").replace(
    "</head>",
    '<link rel="stylesheet" href="preview.css"><script src="preview.js"></script></head>',
  ),
);
