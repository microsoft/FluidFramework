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
export function assert(condition: boolean, message: string | number): asserts condition {
	if (!condition) {
		throw new Error(
			typeof message === "number" ? `0x${message.toString(16).padStart(3, "0")}` : message,
		);
	}
}

/**
 * Asserts that can be conditionally enabled in debug/development builds but will be optimized out of production builds.
 *
 * Disabled by default.
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
				throw new Error(`Debug assert failed: ${result.toString()}`);
			}
		}
	});
}

let debugAssertsEnabled = false;

/**
 * Enables {@link debugAssert} validation.
 * @remarks
 * Throws if debugAsserts have been optimized out.
 * @returns The previous state of debugAsserts.
 * @internal
 */
export function configureDebugAsserts(enabled: boolean): boolean {
	assert(
		nonProductionConditionalsIncluded(),
		"Debug asserts cannot be configured since they have been optimized out.",
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
 * See {@link skipInProduction}.
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
function skipInProduction(conditional: () => void): void {
	// Here __PURE__ annotation is used to indicate that is is safe to optimize out this call.
	// This is valid since the contract for this function is that "conditional" should be side effect free if it were run in production scenarios
	// See https://webpack.js.org/guides/tree-shaking/#mark-a-function-call-as-side-effect-free for documentation on this annotation.

	// Using the exact syntax from https://webpack.js.org/guides/tree-shaking/#mark-a-function-call-as-side-effect-free to maximize compatibility with tree-shaking tools.
	// eslint-disable-next-line spaced-comment
	/*#__PURE__*/ conditional();
}
