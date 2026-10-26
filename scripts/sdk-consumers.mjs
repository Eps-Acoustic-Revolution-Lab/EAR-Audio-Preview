import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const consumer = await fs.mkdtemp(path.join(os.tmpdir(), "ear-sdk-bundlers-"));
const run = (args) =>
  execFileSync("npm", args, { cwd: consumer, stdio: "inherit" });
try {
  await fs.writeFile(
    path.join(consumer, "package.json"),
    '{"private":true,"type":"module"}',
  );
  const files = await fs.readdir(path.join(root, "artifacts/sdk-tarballs"));
  run([
    "install",
    "--ignore-scripts",
    "--prefer-offline",
    "--no-audit",
    "--no-fund",
    ...files
      .filter((file) => file.endsWith(".tgz"))
      .map((file) => path.join(root, "artifacts/sdk-tarballs", file)),
    "vite@6.4.3",
  ]);
  await fs.writeFile(
    path.join(consumer, "index.html"),
    '<!doctype html><div id="view" style="width:160px;height:500px"></div><script type="module" src="/main.js"></script>',
  );
  await fs.writeFile(
    path.join(consumer, "main.js"),
    `import {createPcmSource} from '@ear-audio/core';\nimport {createLevelMeter} from '@ear-audio/level-meter';\nimport '@ear-audio/theme/styles.css';\nconst source=createPcmSource({sampleRate:48000});\nwindow.sdkView=createLevelMeter(document.querySelector('#view'),{source});\nsource.push({left:new Float32Array(2048)});\n`,
  );
  await fs.writeFile(
    path.join(consumer, "webpack.config.cjs"),
    `module.exports={mode:'production',entry:'./main.js',output:{filename:'main.js',path:require('path').resolve(__dirname,'webpack-dist')},module:{rules:[{test:/\\.css$/,use:[${JSON.stringify(path.join(root, "node_modules/style-loader/dist/cjs.js"))},${JSON.stringify(path.join(root, "node_modules/css-loader/dist/cjs.js"))}]}]}}`,
  );
  run(["exec", "--", "vite", "build"]);
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/webpack-cli/bin/cli.js"),
      "--config",
      "webpack.config.cjs",
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  const report = {};
  for (const [kind, folder] of [
    ["vite@6.4.3", "dist/assets"],
    ["webpack@5.90.3", "webpack-dist"],
  ]) {
    report[kind] = {};
    for (const file of await fs.readdir(path.join(consumer, folder))) {
      const buffer = await fs.readFile(path.join(consumer, folder, file));
      if (
        file.endsWith(".js") &&
        /acquireVsCodeApi|PlayerService|essentia\.js/.test(buffer.toString())
      )
        throw new Error(`${kind} leaked host dependency`);
      report[kind][file] = buffer.length;
    }
  }
  await fs.mkdir(path.join(root, "artifacts/sdk"), { recursive: true });
  await fs.writeFile(
    path.join(root, "artifacts/sdk/consumer-builds.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await fs.rm(consumer, { recursive: true, force: true });
}
