import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import webpack from "webpack";
import postcss from "postcss";
import { sdkName, sdkPackages, sdkVersion } from "./sdk-config.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
await fs.rm(".sdk-types", { recursive: true, force: true });
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.sdk.json"],
  { stdio: "inherit" },
);
const entries = new Map(
  Object.entries(sdkPackages).map(([name, entry]) => [
    path.resolve(entry),
    name,
  ]),
);
entries.set(path.resolve("src/sdk/settings.ts"), "core/settings");
const dspModules = Object.fromEntries(
  [
    ...(await fs.readFile("src/sdk/dsp.ts", "utf8")).matchAll(
      /export \* from ["']([^"']+)["']/g,
    ),
  ].map((match) => [
    path.basename(match[1]),
    path.resolve("src/sdk", match[1] + ".ts"),
  ]),
);
for (const [key, value] of Object.entries(dspModules))
  entries.set(value, "dsp/" + key);
const license = await fs.readFile("LICENSE", "utf8");
for (const [name, entry] of Object.entries(sdkPackages)) {
  const dir = path.resolve("packages", name);
  await fs.rm(path.join(dir, "dist"), { recursive: true, force: true });
  await fs.mkdir(path.join(dir, "dist"), { recursive: true });
  const dependencies = {};
  const bundledPackages = new Set();
  await new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: "production",
      plugins: [new webpack.ProvidePlugin({ process: "process/browser" })],
      target: ["web", "es2020"],
      entry:
        name === "dsp"
          ? { index: path.resolve(entry), ...dspModules }
          : name === "core"
            ? {
                index: path.resolve(entry),
                settings: path.resolve("src/sdk/settings.ts"),
              }
            : { index: path.resolve(entry) },
      experiments: { outputModule: true },
      output: {
        path: path.join(dir, "dist"),
        filename: "[name].js",
        library: { type: "module" },
        module: true,
      },
      resolve: { extensions: [".ts", ".js"] },
      module: {
        rules: [
          {
            test: /\.ts$/,
            exclude: /node_modules/,
            use: {
              loader: "ts-loader",
              options: {
                transpileOnly: true,
                compilerOptions: { module: "esnext", declaration: false },
              },
            },
          },
          { test: /\.css$/, use: path.resolve("scripts/sdk-css-loader.cjs") },
        ],
      },
      externalsType: "module",
      externals: [
        ({ context, request }, callback) => {
          if (!request.startsWith(".")) return callback();
          const absolute = path.resolve(
            context,
            request.replace(/\.js$/, "") + ".ts",
          );
          const external = entries.get(absolute);
          if (
            !external ||
            external.split("/")[0] === name ||
            (name === "core" && external === "core/settings")
          )
            return callback();
          const dependency = sdkName(external.split("/")[0]);
          dependencies[dependency] = sdkVersion;
          callback(null, sdkName(external));
        },
      ],
      optimization: { minimize: true },
      performance: { hints: false },
    });
    compiler.run((error, stats) =>
      compiler.close(() => {
        if (error || stats.hasErrors())
          reject(
            error || new Error(stats.toString({ all: false, errors: true })),
          );
        else {
          for (const module of stats.compilation.modules) {
            const resource = module.resource;
            const match = resource?.match(
              /^(.*?node_modules\/(?:@[^/]+\/)?[^/]+)\//,
            );
            if (match) bundledPackages.add(match[1]);
            if (
              resource &&
              /(?:playerService|essentiaHost|audioPreviewEditor)\.ts$/.test(
                resource,
              )
            ) {
              reject(new Error(`Host dependency included: ${resource}`));
              return;
            }
          }
          resolve();
        }
      }),
    );
  });
  for (const dependencyRoot of bundledPackages) {
    const manifest = JSON.parse(
      await fs.readFile(path.join(dependencyRoot, "package.json"), "utf8"),
    );
    const files = await fs.readdir(dependencyRoot);
    for (const file of files.filter((file) =>
      /^(?:licen[cs]e|copying|notice)(?:\.|$)/i.test(file),
    )) {
      const target = path.join(
        dir,
        "dist/licenses",
        manifest.name.replaceAll("/", "__"),
        file,
      );
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(dependencyRoot, file), target);
    }
  }
  const visited = new Set();
  async function copyDeclaration(source) {
    if (visited.has(source)) return;
    visited.add(source);
    const target = path.join(dir, "dist/types", source);
    let text = await fs.readFile(path.join(".sdk-types", source), "utf8");
    const references = [
      ...text.matchAll(/(?:from\s*|import\s*\(|import\s*)["']([^"']+)["']/g),
    ];
    for (const [, reference] of references) {
      if (!reference.startsWith(".") || reference.endsWith(".css")) continue;
      const resolved = path.normalize(
        path.join(
          path.dirname(source),
          reference.replace(/\.js$/, "") + ".d.ts",
        ),
      );
      const original = path.resolve("src", resolved.replace(/\.d\.ts$/, ".ts"));
      const external = entries.get(original);
      if (
        external &&
        external.split("/")[0] !== name &&
        !(name === "core" && external === "core/settings")
      ) {
        text = text
          .split(`'${reference}'`)
          .join(`'${sdkName(external)}'`)
          .split(`"${reference}"`)
          .join(`"${sdkName(external)}"`);
        dependencies[sdkName(external.split("/")[0])] = sdkVersion;
      } else {
        text = text
          .split(`'${reference}'`)
          .join(`'${reference.replace(/\.js$/, "")}.js'`)
          .split(`"${reference}"`)
          .join(`"${reference.replace(/\.js$/, "")}.js"`);
        await copyDeclaration(resolved);
      }
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text);
  }
  const declaration = entry.replace(/^src\//, "").replace(/\.ts$/, ".d.ts");
  await copyDeclaration(declaration);
  const exports = {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
  };
  await fs.writeFile(
    path.join(dir, "dist/index.d.ts"),
    `export * from './types/${declaration.replace(/\.d\.ts$/, ".js")}';\n`,
  );
  if (name === "dsp") {
    for (const [key, source] of Object.entries(dspModules)) {
      const declaration = path
        .relative(path.resolve("src"), source)
        .replace(/\.ts$/, ".d.ts");
      await copyDeclaration(declaration);
      exports["./" + key] = {
        types: "./dist/types/" + declaration,
        import: "./dist/" + key + ".js",
      };
    }
  }
  if (name === "core") {
    await copyDeclaration("sdk/settings.d.ts");
    // Settings have no runtime side effects and are included in the core entry API.
    exports["./settings"] = {
      types: "./dist/types/sdk/settings.d.ts",
      import: "./dist/settings.js",
    };
  }
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: sdkName(name),
        version: sdkVersion,
        description: `EAR standalone audio visualization ${name}`,
        type: "module",
        license: "MIT",
        files: ["dist", "LICENSE", "NOTICE.md", "README.md"],
        sideEffects: false,
        exports,
        dependencies,
        publishConfig: { access: "public" },
      },
      null,
      2,
    ) + "\n",
  );
  await fs.writeFile(path.join(dir, "LICENSE"), license);
  if (name === "dsp")
    await fs.copyFile(
      "node_modules/ooura/LICENSE",
      path.join(dir, "dist/OOURA-LICENSE.txt"),
    );
  await fs.writeFile(
    path.join(dir, "NOTICE.md"),
    "Derived from EAR Audio Preview (MIT), originally forked from sukumo28/vscode-audio-preview (MIT). The original copyright notice is retained in LICENSE. This package bundles only its reachable visualization and DSP code; optional host, decoder and Essentia integrations are excluded.\n",
  );
  console.log(
    `${sdkName(name)}: ${Object.keys(dependencies).join(", ") || "no runtime dependencies"}`,
  );
}
// CSS is opt-in and scoped to SDK roots; no VS Code reset is included.
const themeSources = [
  "src/webview/styles/earEqTokens.css",
  "src/webview/components/liveMeters/liveMeters.css",
  "src/webview/components/contextMenu/contextMenu.css",
];
const themeRoot = postcss.parse(
  (
    await Promise.all(themeSources.map((source) => fs.readFile(source, "utf8")))
  ).join("\n"),
);
themeRoot.walkRules((rule) => {
  if (rule.parent.type === "atrule" && /keyframes$/.test(rule.parent.name))
    return;
  rule.selectors = rule.selectors.map((selector) =>
    selector === ":root" ? ".ear-sdk" : `.ear-sdk ${selector}`,
  );
});
const scoped = themeRoot.toString();
await fs.mkdir("packages/theme/dist", { recursive: true });
await fs.writeFile(
  "packages/theme/dist/styles.css",
  scoped + "\n" + (await fs.readFile("packages/theme/layout.css", "utf8")),
);
await fs.writeFile(
  "packages/theme/dist/index.js",
  "export const themeClassName = 'ear-sdk';\n",
);
await fs.writeFile(
  "packages/theme/dist/index.d.ts",
  'export declare const themeClassName = "ear-sdk";\n',
);
await fs.writeFile("packages/theme/LICENSE", license);
await fs.writeFile(
  "packages/theme/package.json",
  JSON.stringify(
    {
      name: sdkName("theme"),
      version: sdkVersion,
      type: "module",
      license: "MIT",
      files: ["dist", "LICENSE", "README.md"],
      sideEffects: ["**/*.css"],
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
        "./styles.css": "./dist/styles.css",
      },
      publishConfig: { access: "public" },
    },
    null,
    2,
  ) + "\n",
);
