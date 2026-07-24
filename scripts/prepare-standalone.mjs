import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = resolve(projectRoot, ".next", "standalone");

if (!existsSync(standaloneRoot)) {
  throw new Error("Standalone build output was not found. Run next build first.");
}

for (const [source, destination] of [
  [resolve(projectRoot, "public"), resolve(standaloneRoot, "public")],
  [resolve(projectRoot, ".next", "static"), resolve(standaloneRoot, ".next", "static")],
]) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
}

console.log("Standalone assets are ready.");
