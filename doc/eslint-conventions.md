# ESLint naming conventions

CI runs `npm run lint-check` on every push to `main`. Run the same command locally before pushing.

## Rules (`.eslintrc.json`)

| Symbol kind | Allowed formats | Notes |
|-------------|-----------------|-------|
| Classes | `PascalCase` | e.g. `KnobComponent` |
| Type aliases | `PascalCase` | e.g. `KnobOptions` |
| Functions, parameters, methods, properties | `camelCase` | Leading `_` allowed for private-by-convention |
| `public static readonly` class fields | `UPPER_CASE` | e.g. `DEFAULT_SIZE` |
| `const` variables (module or block scope) | `camelCase` **or** `UPPER_CASE` | Use `UPPER_CASE` for true constants (`FAB_SIZE_PX`, `KNOB_VOLUME_UNITY`) |
| Object literal methods | `camelCase` **or** `PascalCase` | `PascalCase` only when mirroring an external API (e.g. Essentia.js `Windowing`, `PitchYinFFT` in test mocks) |

## Common CI failures

**`Variable name FOO_BAR must match camelCase`**

Rename to camelCase, or keep `UPPER_CASE` if the binding is a `const` literal constant. If CI still fails, the `const` + `UPPER_CASE` exception may be missing from `.eslintrc.json`.

**`Object Literal Method name Windowing must match camelCase`**

Essentia.js exposes PascalCase algorithm names. In mocks/stubs, keep the external name and rely on the `objectLiteralMethod` PascalCase allowance — do not rename to camelCase or runtime calls will break.

## Local verification (mirrors GitHub Actions)

```sh
npm run ci
```

Equivalent to the `check` job in `.github/workflows/ci.yml`: lint, format, test, webpack, VSIX package.
