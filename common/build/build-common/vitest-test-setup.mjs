/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Shared vitest setup for FF code-coverage pilots.
 *
 * Usage (from a package's `vitest.config.ts`):
 *
 *   test: {
 *     setupFiles: ["../../../common/build/build-common/vitest-test-setup.mjs"],
 *     // ...
 *   }
 *
 * This file is intentionally pre-compiled ESM (`.mjs`) so consumers don't need
 * to run a tsc build step on build-common just to use it. It imports from the
 * consumer's `vitest` dependency, so `vitest` must already be installed as a
 * devDependency of the consuming package.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  The mocha-context shim
 * ────────────────────────────────────────────────────────────────────────────
 *
 *  FF tests were written against mocha, where `this` inside a `function()`
 *  callback is bound to mocha's Context/Suite object and exposes helpers
 *  like `this.timeout(ms)`, `this.retries(n)`, and `this.skip()`.
 *
 *  Vitest uses a different model: it passes a TaskContext as the first
 *  argument to test callbacks, and binds that same context as `this`. Vitest's
 *  context does NOT have `timeout`/`retries` methods — mocha-style calls
 *  throw TypeError.
 *
 *  This setup installs a defensive `beforeEach` that adds no-op
 *  `timeout`/`retries`/`skip` methods onto the vitest test context if they're
 *  absent. The shim is deliberately inert: real timeouts come from
 *  `testTimeout` in the consumer's `vitest.config.ts`, not from
 *  `this.timeout()`.
 *
 *  Scope and limitations:
 *  - Only works inside `it(…)`/`test(…)` callbacks, where vitest binds its
 *    TaskContext as `this`.
 *  - Does NOT work inside `describe(…)` callbacks. Under strict ESM (which
 *    vitest enforces), a describe callback has `this === undefined`, so
 *    `this.timeout(…)` throws on property access before any shim can run.
 *    Suites that use `describeFuzz`/`describeStress` from
 *    `@fluid-private/stochastic-test-utils` call `this.timeout(…)` at suite
 *    scope and must be excluded per-package in vitest.config.ts.
 *
 *  Do not import a package's `src/test/mochaHooks.ts` from this file — those
 *  hooks generally depend on mocha-specific types/APIs.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  Global name/signature shims for hooks
 * ────────────────────────────────────────────────────────────────────────────
 *
 *  Vitest exposes `beforeAll`/`afterAll`/`beforeEach`/`afterEach` as globals
 *  (via `globals: true`) but does NOT accept mocha's optional leading string
 *  description — `beforeEach("name", fn)` throws "callback value must be
 *  function, received 'string'". Vitest also does not expose mocha's
 *  `before`/`after` aliases at all.
 *
 *  Here we install wrappers that drop the name argument when present, covering
 *  both the missing aliases (`before`/`after`) and the signature mismatch on
 *  `beforeEach`/`afterEach`. Several helpers in FF test code (e.g.
 *  `emulateProductionBuildHooks`, `useSnapshotDirectory`, assorted
 *  beforeEach-with-description calls) expect the mocha shape.
 */

import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

beforeEach((context) => {
	if (typeof context.timeout !== "function") {
		context.timeout = () => undefined;
	}
	if (typeof context.retries !== "function") {
		context.retries = () => undefined;
	}
	if (typeof context.skip !== "function") {
		// Mocha's `this.skip()` marks the current test pending. Vitest's test
		// context has its own `skip` method; don't overwrite it if it's already
		// a function. This shim only kicks in when the test expects mocha's API
		// but vitest didn't bind a skip (e.g. inside a hook context).
		context.skip = () => undefined;
	}
});

/** @param {typeof beforeAll | typeof afterAll | typeof beforeEach | typeof afterEach} hook */
function adaptMochaHook(hook) {
	// Mocha's `before(name?, fn)` (and beforeEach, etc.) accept an optional
	// leading string; vitest's equivalents only accept a function. Drop the
	// name arg.
	return (...args) => {
		const fn = args.length === 2 ? args[1] : args[0];
		hook(fn);
	};
}

// Add missing mocha names.
if (typeof globalThis.before !== "function") {
	globalThis.before = adaptMochaHook(beforeAll);
}
if (typeof globalThis.after !== "function") {
	globalThis.after = adaptMochaHook(afterAll);
}

// Patch signature-incompatible globals that vitest *does* provide.
globalThis.beforeEach = adaptMochaHook(beforeEach);
globalThis.afterEach = adaptMochaHook(afterEach);
globalThis.beforeAll = adaptMochaHook(beforeAll);
globalThis.afterAll = adaptMochaHook(afterAll);

/*
 * `getTestLogger` is populated as a global by `@fluid-internal/mocha-test-setup`'s
 * `beforeAll` hook (see packages/test/mocha-test-setup/src/mochaHooks.ts). Some
 * tests call it indirectly via `TestObjectProvider.logger`. That hook doesn't
 * run under vitest, so supply a no-op stub logger with the minimal
 * `ITelemetryBufferedLogger`-ish shape the consumers expect.
 */
if (typeof globalThis.getTestLogger !== "function") {
	globalThis.getTestLogger = () => ({
		send: () => undefined,
		flush: async () => undefined,
	});
}
