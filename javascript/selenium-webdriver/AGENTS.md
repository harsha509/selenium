<!-- Guidance for AI agents working in Selenium JavaScript Bindings -->

## Code location

- Library: `javascript/selenium-webdriver/lib/` and sibling modules, written in TypeScript (`*.ts`)
- Tests: `javascript/selenium-webdriver/test/` (JavaScript; they load the built package via `selenium-webdriver/...`)
- Test helpers: `javascript/selenium-webdriver/lib/test/` (JavaScript)

## Build model

See `TS_MIGRATION.md` for the migration status, compatibility checks and remaining work.

- `ts_project(name = "ts-src")` in `BUILD.bazel` compiles every `*.ts` in place (`lib/foo.ts` -> `lib/foo.js` + `lib/foo.d.ts`), so deep imports such as `require('selenium-webdriver/lib/foo')` keep working.
- Compiled output goes into the npm package only; do not commit generated `.js` or `.d.ts` next to `.ts` sources.
- `tsconfig.json`: `strict`, `module: nodenext`, target `es2022`. Lint runs typescript-eslint over `**/*.ts`; prettier covers both.
- Public runtime export shapes must match the previous JavaScript module: no `export default`; single-class modules use `export =`; JS-style enums are `as const` objects plus a same-named type.

## Common commands

- Build: `bazel build //javascript/selenium-webdriver:selenium-webdriver`
- Lint and format: `bazel test //javascript/selenium-webdriver:eslint-test //javascript/selenium-webdriver:prettier-test`

## Testing

See `javascript/selenium-webdriver/TESTING.md`

## Code conventions

### Types

- Prefer precise types over `any`; where the wire value is caller-asserted, use a generic (`caps.get<T>()`, `driver.execute<T>()`, `bidi.send<T>()`) rather than a cast.
- Interfaces that describe not-yet-typed peers stay small and local to the module that needs them.

### Logging

```typescript
import * as logging from './logging'
const log_ = logging.getLogger('selenium.webdriver.mymodule')

log_.warning('actionable: something needs attention')
log_.info('useful: driver started successfully')
log_.finer('diagnostic: request details for debugging')
```

### Deprecation

Log a warning directing users to the alternative:

```typescript
log_.warning('oldMethod is deprecated, use newMethod instead')
```

### Documentation

Use JSDoc for public APIs. Types live in the TypeScript signature, so omit `{Type}` annotations:

```typescript
/**
 * Brief description.
 *
 * @param name description
 * @return description
 * @throws {ErrorType} when condition
 */
```
