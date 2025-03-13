/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Asserts the specified condition.
 *
 * @param condition - The condition that should be true, if the condition is false an error will be thrown.
 * Only use this API when `false` indicates a logic error in the problem and thus a bug that should be fixed.
 * @param message - The message to include in the error when the condition does not hold.
 * A number should not be specified manually: use a string.
 * Before a release, policy-check should be run, which will convert any asserts still using strings to
 * use numbered error codes instead.
 * @remarks
 * Use this instead of the node 'assert' package, which requires polyfills and has a big impact on bundle sizes.
 *
 * Assertions using this API will be included in all configurations: there is no option to disable or optimize them out.
 * Thus this API is suitable for detecting conditions that should terminate the application and produce a useful diagnostic message.
 * It can be used to ensure bad states are detected early and to avoid data corruption or harder to debug errors.
 *
 * In cases where the assert is very unlikely to have an impact on production code but is still useful as documentation and for debugging, consider using `debugAssert` instead
 * to optimize bundle size.
 *
 * This API is not intended for use outside of the Fluid Framework client codebase: it will most likely be made internal in the future.
 * @privateRemarks
 * This should be deprecated (as a non internal API) then moved to purely internal.
 * When done the `debugAssert` reference above should be turned into a link.
 * @legacy
 * @alpha
 */
export function assert(
	condition: boolean,
	message: string | number,
	debugMessageBuilder?: () => string,
): asserts condition {
	if (!condition) {
		fail(message, debugMessageBuilder);
	}
}

/**
 * Throw an error with a constant message.
 * @remarks
 * Works like {@link assert}, but errors unconditionally instead of taking in a condition.
 *
 * Unlike `assert`, this `fail` is not "tagged" by the assert tagging too by default.
 * Use a `assertTagging.config.mjs` file to enable this and any other assert tagging customizations as needed.
 *
 * Returns `never` so it can be used inline as part of an expression, or as a return value.
 * @example
 * ```ts
 *  const x: number = numbersMap.get("foo") ?? fail("foo missing from map");
 * ```
 * @internal
 */
export function fail(message: string | number, debugMessageBuilder?: () => string): never {
	let messageString =
		typeof message === "number" ? `0x${message.toString(16).padStart(3, "0")}` : message;
	skipInProduction(() => {
		if (debugMessageBuilder !== undefined) {
			messageString = `${messageString}\nDebug Message:${debugMessageBuilder()}`;
		}
		console.error(`Bug in Fluid Framework: Failed Assertion: ${messageString}`);
	});
	const error = new Error(messageString);
	onAssertionError(error);
	throw error;
}

function onAssertionError(error: Error): void {
	for (const handler of firstChanceAssertionHandler) {
		handler(error);
	}
}

const firstChanceAssertionHandler = new Set<(error: Error) => void>();

/**
 * Add a callback which can be used to report an assertion before it is thrown.
 * @param handler - Called when an assertion occurs before the exception is thrown.
 * @returns a function to remove the handler.
 * @remarks
 * This is mainly useful for triggering a `debugger;` statement and/or reporting telemetry to aid Fluid with diagnosing and fixing the bugs which cause asserts.
 * It can also be used to record that an fatal error has occurred to help avoid complicating the diagnosis by doing more work after the error which might error again in a different way.
 * @alpha
 */
export function onAssertionFailure(handler: (error: Error) => void): () => void {
	// To avoid issues if the same callback is registered twice (mainly it not triggering twice and the first unregister removing it),
	// generate a wrapper around the handler.
	const wrapper = (error: Error): void => {
		handler(error);
	};
	firstChanceAssertionHandler.add(wrapper);
	return () => {
		firstChanceAssertionHandler.delete(wrapper);
	};
}

/**
 * Asserts that can be conditionally enabled in debug/development builds but will be optimized out of production builds.
 *
 * Enabled by default.
 *
 * If the assert must be enforced/checked in production or enabled by default, use {@link assert} instead.
 *
 * @param predicate - A pure function that should return true if the condition holds, or a string or object describing the condition that failed.
 * This function will only be run in some configurations so it should be pure, and only used to detect bugs (when debugAssert are enabled), and must not be relied on to enforce the condition is true: for that use {@link assert}.
 * @remarks
 * Optimizing the asserts out of the bundle requires a bundler like webpack which leverages `__PURE__` annotations like https://webpack.js.org/guides/tree-shaking/#mark-a-function-call-as-side-effect-free.
 *
 * Exceptions thrown by this function must never be caught in production code, as that will result in different behavior when testing and when running optimized builds.
 * The `predicate` function must be pure (have no side-effects) to ensure that the behavior of code is the same regardless of if the asserts are disabled, enabled or optimized out.
 *
 * These asserts are disabled by default, even in debug builds to ensure that by default code will be tested as production runs, with them disabled.
 * Additionally, this ensures that apps that use a bundler which does not remove `__PURE__` will not incur the runtime cost of calling the predicate.
 * These asserts can be can be enabled by calling `configureDebugAsserts(true)`: see {@link configureDebugAsserts}.
 *
 * @privateRemarks
 * This design was chosen to accomplish two main goals:
 *
 * 1. Make it easy to compile debug asserts fully out of production builds.
 * For webpack this happens by default, avoiding the need for customers to do special configuration.
 * This is important for both performance and bundle size.
 *
 * 2. Make it easy to test (both manually and automated) with and without the predicates running.
 * This ensures it is possible to benefit from the asserts when enabled, but also test with them disabled to ensure this disablement doesn't cause bugs.
 *
 * The default behavior of having debugAsserts disabled helps ensure that tests which don't know about debug asserts will still run in a way that is most similar to production.
 * @internal
 */
export function debugAssert(predicate: () => true | { toString(): string }): void {
	// This is valid since the contract for this function is that "predicate" should be side effect free and never return non true in production scenarios:
	// it returning non-true indicates a bug is present, and that the validation it does to detect the bug is only desired in specific test/debug situations.
	// Production scenarios, where pure code is removed, should never hit a failing predicate, and thus this code should be side effect free.
	skipInProduction(() => {
		if (debugAssertsEnabled) {
			const result = predicate();
			if (result !== true) {
				debugger;
				const error = new Error(`Debug assert failed: ${result.toString()}`);
				onAssertionError(error);
				throw error;
			}
		}
	});
}

let debugAssertsEnabled = true;

/**
 * Enables {@link debugAssert} validation.
 * @remarks
 * Throws if debugAsserts have been optimized out.
 *
 * Disabling debugAsserts has two main use cases:
 *
 * 1. Testing that the code behaves correctly in a more production like configuration.
 * 2. Reducing performance overhead.
 *
 * Disabling debugAsserts does not make everything production like: see {@link emulateProductionBuild} for a way to disable more non-production code.
 *
 * @returns The previous state of debugAsserts.
 * @internal
 */
export function configureDebugAsserts(enabled: boolean): boolean {
	assert(
		nonProductionConditionalsIncluded(),
		0xab1 /* Debug asserts cannot be configured since they have been optimized out. */,
	);
	const old = debugAssertsEnabled;
	debugAssertsEnabled = enabled;
	return old;
}

/**
 * Checks if non-production conditional code like {@link debugAssert} is included in this build.
 * @remarks
 * Such code can be optimized out by bundlers: this checks if that has occurred.
 * @privateRemarks
 * See {@link skipInProductionInner}.
 * @internal
 */
export function nonProductionConditionalsIncluded(): boolean {
	let included = false;
	skipInProduction(() => {
		included = true;
	});
	return included;
}

/**
 * Overrides the behavior code which optimizes out non-production conditional code like {@link debugAssert} and {@link nonProductionConditionalsIncluded}.
 *
 * Can be called multiple times. Will emulate production builds if called with `true` more times than `false`.
 * Emulation of production builds is disabled when enabled and disabled counts match (including at 0, by default).
 * It is an error to disabled this more than it was enabled.
 *
 * @remarks
 * This is intended testing that the code behaves correctly in production configurations.
 * Since tools like {@link debugAssert} typically add additional validation to help catch more bugs, tests should generally be run with such checks enabled (and thus emulateProductionBuild in its default disabled state).
 * However it is possible that some debugAsserts could accidentally change behavior and hide a bug.
 * Thus function provides a way to globally disable the debugAsserts so it is possible to run test suites in this mode without having to do a production bundling of them.
 *
 * To avoid introducing additional risk that code does production specific logic using this setting, the actual setting is not exposed.
 * The intended use is that a pipeline could enable this before running the test suite (for example based on a CLI flag).
 * Such a run may have to also use some filtering to skip any tests which explicity check development only tooling, possibly via {@link nonProductionConditionalsIncluded} or some other mechanism like a test tag.
 *
 * @privateRemarks
 * See {@link skipInProduction}.
 *
 * This design, with a counter, was picked so that its always safe for some scope to opt in when trying to test production behavior,
 * and it should be basically impossible to accidentally fail to test the production mode when trying to.
 * Some tests or test suites may want to run in production mode and they can use this API to op in (via before and after hooks for example).
 * Additionally something might want to opt into to production mode at some other level (for example test running the entire test suite again with production mode enabled).
 * In such setups, its important that tests which were explicitly opting in don't accidentally disable production mode for the rest of the run when ending if something higher level enabled it.
 *
 * The approach taken with `configureDebugAsserts` is a bit more flexible, allowing both opt in and opt out, but also more error prone.
 * This API, `emulateProductionBuild` provides a more restrictive but less error prone option targeted at being a final defense for detecting cases where production mode causes issues.
 * It catches some cases `configureDebugAsserts` can't, like dependency on side effects of failing asserts debug message callback.
 * @internal
 */
export function emulateProductionBuild(enable = true): void {
	emulateProductionBuildCount += enable ? 1 : -1;
	assert(
		emulateProductionBuildCount >= 0,
		"emulateProductionBuild disabled more than it was enabled",
	);
}

let emulateProductionBuildCount = 0;

function skipInProduction(conditional: () => void): void {
	skipInProductionInner(() => {
		if (emulateProductionBuildCount === 0) conditional();
	});
}

/**
 * Run `conditional` only in debug/development (non optimized/minified) builds, but optimize it out of production builds.
 *
 * @param conditional - This function will only be run in some configurations so it should be pure (at least in production scenarios).
 * It can be used to interact with debug only functionality that is also removed in production builds, or to do validation/testing/debugging that can be assumed to be sideeffect free in production where it might be removed.
 * @remarks
 * Great care must be taken when using this to ensure that bugs are not introduced which only occur when `conditional` is not run.
 * One way to do this is to provide an alternative way to disable the effects of `conditional` in development builds so both configurations can be tested:
 * {@link debugAssert} uses this pattern.
 *
 * @privateRemarks
 * Since this function has no built in option for toggling it in development for testing, it is not exported and is only used as a building block for other testable options.
 * There are some additional details about syntax and bundler support in https://github.com/javascript-compiler-hints/compiler-notations-spec/tree/main .
 * This code uses both NO_SIDE_EFFECTS and PURE to maximize compatibility: for any bundler supporting both they are redundant.
 */
// Using the exact syntax from https://github.com/javascript-compiler-hints/compiler-notations-spec/blob/main/no-side-effects-notation-spec.md to maximize compatibility with tree-shaking tools.
// eslint-disable-next-line spaced-comment
/*#__NO_SIDE_EFFECTS__*/
function skipInProductionInner(conditional: () => void): void {
	// Here __PURE__ annotation is used to indicate that is is safe to optimize out this call.
	// This is valid since the contract for this function is that "conditional" should be side effect free if it were run in production scenarios
	// See https://webpack.js.org/guides/tree-shaking/#mark-a-function-call-as-side-effect-free for documentation on this annotation.

	// Using the exact syntax from https://webpack.js.org/guides/tree-shaking/#mark-a-function-call-as-side-effect-free to maximize compatibility with tree-shaking tools.
	// eslint-disable-next-line spaced-comment
	/*#__PURE__*/ conditional();
}
