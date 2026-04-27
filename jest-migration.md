# Jest & Puppeteer → Mocha Migration

This document tracks the migration of all packages in this repo that use `jest` or `puppeteer` to
`mocha`. It also captures research on migration strategy and known pitfalls.

---

## Migration strategy

### Key distinction: jsdom vs. Playwright

Not every package can migrate to `mocha + jsdom`. The packages below fall into two groups:

| Current stack | Test type | Target |
|---|---|---|
| `jest` + `testEnvironment: jsdom` | DOM unit/component tests | **Mocha + jsdom** |
| `jest-puppeteer` + real web server | E2E browser tests | **Playwright** (`@playwright/test`) |

`jsdom` cannot substitute for puppeteer-driven tests. Those tests launch a real Chromium instance,
navigate to `localhost`, and interact with a running app. `jsdom` has no CSS box model, no canvas
rendering, no service workers, and no real network stack. For those tests, the correct replacement
is **Playwright** — the API is nearly identical to puppeteer's (`page.goto`, `page.evaluate`,
`page.waitForSelector` all translate directly), and it has TypeScript-first support.

### Mocha + jsdom setup

For packages migrating from `jest` + `testEnvironment: jsdom`:

1. Add `.mocharc.cjs` following the standard repo pattern:
   ```js
   const getFluidTestMochaConfig = require("@fluid-internal/mocha-test-setup/mocharc-common");
   module.exports = getFluidTestMochaConfig(__dirname);
   ```
2. Add `global-jsdom` and require it in the mocha config or a setup file:
   ```
   --require global-jsdom/register
   ```
   jsdom requires a URL to be set (for `localStorage` etc.) — `global-jsdom` defaults to
   `http://localhost:3000`.
3. Replace `jest-environment-jsdom` with `global-jsdom` in `devDependencies`.
4. Replace `ts-jest` with the standard `fluid-tsc` build pipeline — run tests against pre-built
   `lib/` (ESM) or `dist/` (CJS) output.

### Assertions & mocking

| Jest API | Mocha equivalent |
|---|---|
| `expect(x).toBe(y)` | `assert.strictEqual(x, y)` (node:assert) or `expect(x).to.equal(y)` (Chai) |
| `expect(x).toEqual(y)` | `assert.deepEqual(x, y)` or `expect(x).to.deep.equal(y)` |
| `expect(x).toHaveLength(n)` | Chai: `expect(x).to.have.lengthOf(n)` |
| `jest.fn()` | `sinon.stub()` / `sinon.spy()` |
| `jest.spyOn(obj, 'method')` | `sinon.spy(obj, 'method')` or `sinon.stub(obj, 'method')` |
| `jest.useFakeTimers()` | `sinon.useFakeTimers()` (same underlying `@sinonjs/fake-timers`) |
| `jest.advanceTimersByTime(n)` | `clock.tick(n)` |
| `beforeAll` / `afterAll` | `before` / `after` (inside a `describe` block) |

The repo already uses Chai + Sinon in some packages (e.g. `devtools-browser-extension`). Standardizing on these is the lowest-friction path.

### React Testing Library (`@testing-library/*`)

`@testing-library/react` works with any test framework — it just renders into a DOM. The
jest-specific part is `@testing-library/jest-dom`, which patches Jest's `expect` with custom DOM
matchers (`.toBeVisible()`, `.toHaveTextContent()`, etc.).

For mocha, use [`@testing-library/jest-dom`](https://github.com/testing-library/jest-dom) with
the Chai plugin: `chai-jest-dom` (`chai.use(chaiJestDom)`). This restores all the same matchers
against Chai's `expect`.

### Module mocking (ESM)

`jest.mock()` has no direct mocha equivalent. The repo builds to ESM (`lib/`) — for ESM-aware
module replacement use [`esmock`](https://github.com/iambumblehead/esmock):

```js
import esmock from 'esmock';
const mod = await esmock('./my-module.js', { './dep.js': { fn: sinon.stub() } });
```

`proxyquire` and `rewire` do not support ESM. Any test using `rewire` today must be rewritten.

### jest-puppeteer globals

`jest-puppeteer` injects `page`, `browser`, and `context` as globals. In Playwright, these are
explicit fixtures — each test receives them as function arguments:

```ts
// jest-puppeteer
it('loads', async () => { await page.goto(globals.PATH); });

// Playwright
test('loads', async ({ page }) => { await page.goto(process.env.PATH); });
```

The test timeout / port injection pattern (via `@fluidframework/test-tools`) will also need to
be adapted to Playwright's `webServer` config option.

### canvas mock

`devtools-view`'s `jest.setup.cjs` mocks canvas with `jest.fn()`. In mocha, replace with:
```js
HTMLCanvasElement.prototype.getContext = () => null;
```

### Types cleanup

`packages/test/types_jest-environment-puppeteer` is an internal type-shim package that exposes
the `page`, `browser`, and `context` globals from `jest-environment-puppeteer`. Once all
consumers are migrated, this package and its `workspace:~` references can be deleted.

---

## Package checklist

### Group A — Migrate to Mocha + jsdom

These packages use `jest` with a jsdom test environment (no puppeteer). They are the most
straightforward to migrate.

- [ ] **`@fluidframework/driver-web-cache`** (`packages/drivers/driver-web-cache`)
  - 3 test files; `testEnvironment: "jsdom"` in jest config
  - Uses `jest.fn()` and `jest.spyOn()` — replace with `sinon.stub()` / `sinon.spy()`
  - No puppeteer

- [ ] **`@fluid-example/app-insights-logger`** (`examples/client-logger/app-insights-logger`)
  - 1 test file; `testEnvironment: "jsdom"` in jest config
  - Uses `@testing-library/react`; tests run against TypeScript source via `ts-jest`
  - Needs `global-jsdom` and build pipeline switch to pre-built output
  - Needs `fetch` / `Headers` / `Response` polyfills (currently injected as jest globals)

- [ ] **`@fluid-internal/devtools-view`** (`packages/tools/devtools/devtools-view`)
  - 11 test files; React component tests using `@testing-library/react` + `@testing-library/jest-dom`
  - 3 test files use `jest.fn()` / `jest.spyOn()` (`DynamicComposedChart`, `NoDevtoolsErrorBar`, `OpLatencyView`)
  - `jest.setup.cjs` mocks canvas via `jest.fn()` — replace with a plain stub
  - All tests import `@testing-library/jest-dom` for custom DOM matchers — needs Chai plugin
  - **Note:** The jest config comment documents known issues with `.cts` files and FluentUI's lack
    of proper ESM support that forced running against pre-built `lib/` output and skipping ESM
    tests from the command line. These constraints will carry over to mocha.

---

### Group B — Migrate E2E tests to Playwright

These packages use `jest` + `jest-puppeteer` to drive a real Chromium browser against a running
dev server. `jsdom` cannot replace this. The correct target is **`@playwright/test`**.

All packages in this group follow the same pattern: one test file, `jest-puppeteer` preset,
`expect-puppeteer` helpers, and a `globals.PATH` URL pointing at `localhost:<port>`. Migration
is largely mechanical.

#### Example apps

- [ ] **`@fluid-example/blobs`** (`examples/apps/blobs`)
- [ ] **`@fluid-example/collaborative-textarea`** (`examples/apps/collaborative-textarea`)
- [ ] **`@fluid-example/contact-collection`** (`examples/apps/contact-collection`)
- [ ] **`@fluid-example/data-object-grid`** (`examples/apps/data-object-grid`)
- [ ] **`@fluid-example/diceroller`** (`examples/apps/diceroller`)
- [ ] **`@fluid-example/presence-tracker`** (`examples/apps/presence-tracker`)
- [ ] **`@fluid-example/staging`** (`examples/apps/staging`)
- [ ] **`@fluid-example/task-selection`** (`examples/apps/task-selection`)
- [ ] **`@fluid-example/tree-comparison`** (`examples/apps/tree-comparison`)

#### Bubblebench benchmarks

- [ ] **`@fluid-example/bubblebench-baseline`** (`examples/benchmarks/bubblebench/baseline`)
- [ ] **`@fluid-example/bubblebench-experimental-tree`** (`examples/benchmarks/bubblebench/experimental-tree`)
- [ ] **`@fluid-example/bubblebench-ot`** (`examples/benchmarks/bubblebench/ot`)
- [ ] **`@fluid-example/bubblebench-shared-tree`** (`examples/benchmarks/bubblebench/shared-tree`)

#### Data objects

- [ ] **`@fluid-example/canvas`** (`examples/data-objects/canvas`)
- [ ] **`@fluid-example/clicker`** (`examples/data-objects/clicker`)
- [ ] **`@fluid-example/multiview-container`** (`examples/data-objects/multiview/container`)
- [ ] **`@fluid-example/table-tree`** (`examples/data-objects/table-tree`)
- [ ] **`@fluid-example/todo`** (`examples/data-objects/todo`)

#### Service clients

- [ ] **`@fluid-example/app-integration-external-controller`** (`examples/service-clients/azure-client/external-controller`)
- [ ] **`@fluid-example/azure-client-todo-list`** (`examples/service-clients/azure-client/todo-list`)

#### Version migration

- [ ] **`@fluid-example/app-integration-live-schema-upgrade`** (`examples/version-migration/live-schema-upgrade`)
- [ ] **`@fluid-example/version-migration-same-container`** (`examples/version-migration/same-container`)
- [ ] **`@fluid-example/version-migration-separate-container`** (`examples/version-migration/separate-container`)
- [ ] **`@fluid-example/tree-shim`** (`examples/version-migration/tree-shim`)

#### View integration

- [ ] **`@fluid-example/app-integration-container-views`** (`examples/view-integration/container-views`)
- [ ] **`@fluid-example/app-integration-external-views`** (`examples/view-integration/external-views`)
- [ ] **`@fluid-example/view-framework-sampler`** (`examples/view-integration/view-framework-sampler`)

#### External data — special handling required

- [ ] **`@fluid-example/app-integration-external-data`** (`examples/external-data`)
  - 4 test files (more coverage than the typical single-file example)
  - Injects a dynamic port via `@fluidframework/test-tools` (`testTools.getTestPort`) in the jest
    config — this needs to be adapted to Playwright's `webServer` config or equivalent
  - Uses `jest-junit` reporter with a custom `testTimeout: 10000`

---

### Group C — Packages with mixed mocha + jest (partial migration)

These packages already have mocha unit tests. Only their E2E layer uses jest+puppeteer.

- [ ] **`@fluid-internal/devtools-browser-extension`** (`packages/tools/devtools/devtools-browser-extension`)
  - `src/test/` — already uses mocha + chai + sinon; **no changes needed here**
  - `e2e-tests/chromebrowserdevtool.test.ts` — jest + puppeteer E2E test; migrate to Playwright
  - **Note:** This test exercises a browser extension. Playwright has native extension loading
    support (`chromium.launchPersistentContext` with `args: ['--load-extension=...']`) — verify
    the extension loading mechanism works with Playwright before migrating.

- [ ] **`@fluid-private/devtools-test-app`** (`packages/tools/devtools/devtools-test-app`)
  - 1 test file (`ExampleUi.test.ts`); jest + `jest-puppeteer` preset
  - Uses `testTools.getTestPort` for dynamic port injection (same pattern as `external-data`)
  - Has both `jest-environment-jsdom` and `jest-environment-puppeteer` in devDeps, but the config
    only uses the puppeteer preset — the jsdom dep appears unused

- [ ] **`@fluid-internal/client-utils`** (`packages/common/client-utils`)
  - `src/test/mocha/` — already uses mocha; **no changes needed**
  - `src/test/jest/` contains two jest tests:
    - `buffer.spec.ts` — pure isomorphism test; can migrate to mocha with no jsdom needed
    - `gitHash.spec.ts` — uses `rewire` to access a private function AND `page.evaluate()` to run
      `crypto.subtle` inside real Chromium and compare with Node's result. This test **requires a
      real browser** and must migrate to Playwright. The `rewire` usage must be replaced with
      `esmock` or by exposing the function under test differently.
  - **Note:** The jest config comment says "Only CJS is tested per use of rewire in gitHash.spec.ts"
    — once rewire is removed, both ESM and CJS variants can be tested.

---

### Group D — Cleanup tasks

- [ ] **`@fluid-example/bundle-size-tests`** (`examples/utils/bundle-size-tests`)
  - Already uses mocha; tests don't use puppeteer at all
  - Remove `puppeteer` from `devDependencies`

- [ ] **`packages/test/types_jest-environment-puppeteer`** (`packages/test/types_jest-environment-puppeteer`)
  - Internal type-shim that provides TypeScript declarations for the `page`, `browser`, and
    `context` globals injected by `jest-environment-puppeteer`
  - Delete this package once all consumers (currently: `devtools-browser-extension`,
    `devtools-test-app`, `client-utils`) have been migrated off `jest-puppeteer`

---

## Summary

| Group | Count | Action |
|---|---|---|
| A — Mocha + jsdom | 3 | Replace jest with mocha; add global-jsdom |
| B — Playwright (E2E, examples) | 28 | Replace jest-puppeteer with `@playwright/test` |
| C — Partial migration | 3 | Migrate only the jest/puppeteer layer; mocha unit tests already done |
| D — Cleanup | 2 | Remove orphaned dep / delete shim package |
| **Total** | **36** | |
