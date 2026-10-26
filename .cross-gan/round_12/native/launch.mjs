import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
const root = process.cwd(),
  out = path.join(root, ".cross-gan/round_12/native"),
  ext = path.join(out, "extensions/ear");
await fs.mkdir(ext, { recursive: true });
for (const f of ["package.json", "ear_audio.png", "dist"])
  await fs.cp(path.join(root, f), path.join(ext, f), { recursive: true });
await fs.cp(path.join(root, "bench/plugins/controller"),path.join(out,"controller"),{recursive:true});
const controllerPath=path.join(out,"controller/extension.cjs");
await fs.writeFile(controllerPath,(await fs.readFile(controllerPath,"utf8")).replace("9477","9497"));
const profile = await fs.mkdtemp("/tmp/ear-r12-native-");
await fs.mkdir(path.join(profile, "User"), { recursive: true });
await fs.writeFile(
  path.join(profile, "User/settings.json"),
  JSON.stringify({
    "workbench.startupEditor": "none",
    "security.workspace.trust.enabled": false,
    "telemetry.telemetryLevel": "off",
    "update.mode": "none",
    "extensions.autoUpdate": false,
    "window.restoreWindows": "none",
    "chat.disableAIFeatures": true,
  }),
);
const sr = 44100,
  n = sr * 12,
  b = Buffer.alloc(44 + n * 4);
b.write("RIFF");
b.writeUInt32LE(b.length - 8, 4);
b.write("WAVEfmt ", 8);
b.writeUInt32LE(16, 16);
b.writeUInt16LE(1, 20);
b.writeUInt16LE(2, 22);
b.writeUInt32LE(sr, 24);
b.writeUInt32LE(sr * 4, 28);
b.writeUInt16LE(4, 32);
b.writeUInt16LE(16, 34);
b.write("data", 36);
b.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) {
  let v = Math.round(10000 * Math.sin((2 * Math.PI * 440 * i) / sr));
  b.writeInt16LE(v, 44 + i * 4);
  b.writeInt16LE(v, 46 + i * 4);
}
for (const name of ["tone440.wav", "tone440-copy.wav"])
  await fs.writeFile(path.join(out, name), b);
const token = randomBytes(24).toString("hex"),
  log = await fs.open(path.join(out, "editor.log"), "w");
const child = spawn(
  "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
  [
    `--user-data-dir=${profile}`,
    `--extensions-dir=${path.join(out, "extensions")}`,
    `--extensionDevelopmentPath=${path.join(out, "controller")}`,
    "--remote-debugging-port=9496",
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
    "--mute-audio",
    "--new-window",
    out,
  ],
  {
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
    env: { ...process.env, EAR_BENCH_TOKEN: token },
  },
);
child.unref();
await fs.writeFile(
  path.join(out, "session.json"),
  JSON.stringify({ token, pid: child.pid, out, profile }),
);
console.log({ pid: child.pid, out });
