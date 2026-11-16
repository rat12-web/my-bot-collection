import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const backupApiDir = path.join(root, ".cf-api-backup");
const nextDir = path.join(root, ".next");
const outDir = path.join(root, "out");
const distDir = path.join(root, "dist");

console.log("Building static bundle for Cloudflare Pages...");

if (fs.existsSync(backupApiDir)) {
  fs.rmSync(backupApiDir, { recursive: true, force: true });
}
if (fs.existsSync(apiDir)) {
  fs.renameSync(apiDir, backupApiDir);
}
if (fs.existsSync(nextDir)) {
  fs.rmSync(nextDir, { recursive: true, force: true });
}
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}

try {
  execSync("npx next build", {
    stdio: "inherit",
    env: { ...process.env, CF_PAGES_EXPORT: "1" },
  });
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.cpSync(outDir, distDir, { recursive: true });
  console.log("Cloudflare Pages static output ready at ./dist");
} finally {
  if (fs.existsSync(backupApiDir)) {
    fs.renameSync(backupApiDir, apiDir);
  }
}
