import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sdkName, sdkPackages, sdkVersion } from "./sdk-config.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const consumer = await fs.mkdtemp(path.join(os.tmpdir(), "ear-sdk-consumer-"));
try {
  await fs.writeFile(
    path.join(consumer, "package.json"),
    '{"private":true,"type":"module"}\n',
  );
  const names = [...Object.keys(sdkPackages), "theme"];
  const tarballs = names.map((name) =>
    path.join(
      root,
      "artifacts/sdk-tarballs",
      `ear-audio-${name}-${sdkVersion}.tgz`,
    ),
  );
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs],
    { cwd: consumer, stdio: "inherit" },
  );
  await fs.writeFile(
    path.join(consumer, "check.mjs"),
    names.map((name) => `await import('${sdkName(name)}');`).join("\n") +
      "\nawait import('@ear-audio/core/settings');\n",
  );
  execFileSync(process.execPath, ["check.mjs"], {
    cwd: consumer,
    stdio: "inherit",
  });
  for (const name of names) {
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(consumer, "node_modules", sdkName(name), "package.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.type, "module");
    const script = await fs.readFile(
      path.join(consumer, "node_modules", sdkName(name), "dist/index.js"),
      "utf8",
    );
    assert(
      !/acquireVsCodeApi|PlayerService|essentia\.js/.test(script),
      `${name} includes a host dependency`,
    );
  }
  const source = names
    .map(
      (name) =>
        `import * as ${name.replaceAll("-", "_")} from '${sdkName(name)}';`,
    )
    .join("\n");
  await fs.writeFile(path.join(consumer, "check.ts"), source);
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--module",
      "nodenext",
      "--moduleResolution",
      "nodenext",
      "--target",
      "es2020",
      "--lib",
      "es2020,dom",
      "check.ts",
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  console.log(
    "SDK tarballs install, import without DOM, and typecheck in an isolated consumer.",
  );
} finally {
  await fs.rm(consumer, { recursive: true, force: true });
}
