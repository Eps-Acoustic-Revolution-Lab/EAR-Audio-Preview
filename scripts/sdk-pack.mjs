import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sdkPackages } from "./sdk-config.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "artifacts/sdk-tarballs");
await fs.mkdir(output, { recursive: true });
for (const name of [...Object.keys(sdkPackages), "theme"]) {
  execFileSync("npm", ["pack", "--pack-destination", output], {
    cwd: path.join(root, "packages", name),
    stdio: "inherit",
  });
}
