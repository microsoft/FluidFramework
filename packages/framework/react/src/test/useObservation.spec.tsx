/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import { version as reactVersion } from "react";

import {
	useObservation,
	useObservationStrict,
	useObservationWithEffects,
} from "../useObservation.js";

// There is much more coverage of useObservation via useTree tests.

/**
 * Major version of the React being tested against (18 or 19).
 * @remarks
 * The package supports both, and their StrictMode behavior differs in ways the expected logs must account for.
 */
const reactMajorVersion = Number.parseInt(reactVersion, 10);

describe("useObservation", () => {
	describe("dom tests", () => {
		let cleanup: () => void;

		before(() => {
			cleanup = globalJsdom();
		});

		after(() => {
			cleanup();
		});

		const observationHooks: (typeof useObservation)[] = [
			useObservation,
			useObservationStrict,
			useObservationWithEffects,
		] as const;

		for (const useObservationHook of observationHooks) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
			describe((useObservationHook as Function).name, () => {
				for (const reactStrictMode of [false, true]) {
					/**
					 * Check then clear the contents of `log`.
					 *
					 * @remarks When in StrictMode, React may double render, so that case is not checked for an exact match.
					 */
					function checkRenderLog(log: string[], expected: readonly string[]): void {
						if (reactStrictMode) {
							assert.deepEqual(new Set(log), new Set(expected));
						} else {
							assert.deepEqual(log, expected);
						}
						log.length = 0;
					}

					/**
					 * The `unsubscribe` event(s), if any, expected from the StrictMode double-invoked mount render.
					 *
					 * @remarks
					 * When rendering (as opposed to re-rendering) in StrictMode, React 19 synchronously unsubscribes the
					 * throwaway subscription created by the discarded render, while React 18 defers that cleanup until the
					 * `SubscriptionsWrapper` is garbage collected. Both are correct and leak-free. The effect-based
					 * `useObservationWithEffects` subscribes in an effect rather than during render, so it does neither.
					 */
					const strictModeMountUnsubscribe: readonly string[] =
						reactStrictMode &&
						reactMajorVersion >= 19 &&
						useObservationHook !== useObservationWithEffects
							? ["unsubscribe"]
							: [];

					describe(`StrictMode: ${reactStrictMode}`, () => {
						it("useObservation", async () => {
							const log: string[] = [];

							const unsubscribe = (): void => {
								log.push("unsubscribe");
							};

							function TestComponent(): JSX.Element {
								log.push("render");
								return useObservationHook(
									(invalidate) => {
										log.push(`useObservation`);
										return {
											result: (
												<button
													onClick={() => {
														// In real usage, this would unsubscribe from any events.
														log.push("click");
														invalidate();
													}}
												>
													Invalidate
												</button>
											),
											unsubscribe,
										};
									},
									{ onInvalidation: () => log.push("invalidated") },
								);
							}

							const content = <TestComponent />;

							const rendered = render(content, { reactStrictMode });
							checkRenderLog(log, ["render", ...strictModeMountUnsubscribe, "useObservation"]);

							rendered.rerender(content);
							assertLogEmpty(log);

							const button =
								rendered.baseElement.querySelector("button") ??
								assert.fail("button not found");
							button.click();

							checkRenderLog(log, ["click", "invalidated"]);

							rendered.rerender(content);

							checkRenderLog(log, [
								"render",
								...(reactStrictMode && useObservationHook !== useObservationWithEffects
									? ["unsubscribe"]
									: []),
								"useObservation",
							]);
						});

						// This requires waiting for finalizers.
						// Forcing two async GCs seems to work robustly, so this is enabled, but if it becomes flakey, it can be tweaked and/or skipped.
						it(`unsubscribe on unmount`, async () => {
							assert(global.gc);

							const log: string[] = [];

							const unsubscribe = (): void => {
								log.push("unsubscribe");
							};

							function TestComponent(this: unknown): JSX.Element {
								return useObservationHook((invalidate) => ({
									result: <br />,
									unsubscribe,
								}));
							}

							const rendered = render(<TestComponent />, { reactStrictMode });

							// Consume the StrictMode mount unsubscribe (present on React 19, absent on React 18) so the
							// post-unmount check below observes only the unsubscribe from unmount. See strictModeMountUnsubscribe.
							checkRenderLog(log, strictModeMountUnsubscribe);
							rendered.unmount();

							// Unsubscribe on unmount is done via FinalizationRegistry, so force a GC and wait for it.
							// For this to pass on NodeJs experimentally is has been found that this must either do:
							// 1. a sync GC then a wait of 8 seconds (but this sometimes fails after multiple runs unless a debugger takes a heap snapshot, possible due to some JIT optimization that breaks it).
							// 2. two async GCs in a row.
							// Since the second option is both more robust and faster, that is what is used here.
							for (let index = 0; index < 2; index++) {
								await global.gc({ type: "major", execution: "async" });
								if (log.length > 0) {
									break;
								}
							}

							checkRenderLog(log, ["unsubscribe"]);
						});

						it("invalidate after unmount", () => {
							const log: string[] = [];

							let logUnsubscribe = true;

							const unsubscribe = (): void => {
								if (logUnsubscribe) log.push("unsubscribe");
							};

							const invalidateCallbacks: (() => void)[] = [];

							function TestComponent(): JSX.Element {
								log.push("render");
								return useObservationHook(
									(invalidate) => {
										invalidateCallbacks.push(invalidate);
										return {
											result: <br />,
											unsubscribe,
										};
									},
									{ onInvalidation: () => log.push("invalidated") },
								);
							}

							const rendered = render(<TestComponent />, { reactStrictMode });

							checkRenderLog(log, ["render", ...strictModeMountUnsubscribe]);

							// After unmount, unsubscribe could happen at any time due to finalizer,so suppress logging it to prevent the test from possibly becoming flaky.
							logUnsubscribe = false;

							rendered.unmount();

							assert(invalidateCallbacks.length === (reactStrictMode ? 2 : 1));

							// Invalidate after unmount.
							// Since this can happen in real use, due to unsubscribe delay while waiting for finalizer, ensure it does not cause issues.
							//
							// The invalidate callback must not throw when called after unmount. For the finalizer-based
							// hooks the subscription can still be live during the window before garbage collection, so a real
							// event could invoke it; a throw there would surface as a nondeterministic (GC-timing dependent)
							// error in user code. It must instead be a safe no-op that reports "invalidated" (it does a React
							// setState after unmount, which React tolerates).
							//
							// The one exception is useObservationStrict under React 19's StrictMode: it eagerly disposes the
							// throwaway subscription created by the discarded double-render invocation (which is the first of
							// the two generations). That subscription's events are already torn down, so in real use its
							// invalidate callback can never fire, and invoking it here would throw "Already disposed". Skip
							// that eagerly-disposed generation and invalidate only the still-live one(s).
							const eagerlyDisposedGenerations =
								reactStrictMode &&
								reactMajorVersion >= 19 &&
								useObservationHook === useObservationStrict
									? 1
									: 0;

							for (const callback of invalidateCallbacks.slice(eagerlyDisposedGenerations)) {
								callback();
							}

							// Confirm the invalidation happened.
							// If we didn't suppress unsubscribe logging, and the finalizer had run, this could fail (which is why we suppress it).
							checkRenderLog(log, ["invalidated"]);
						});
					});
				}
			});
		}
	});
});

/**
 * Assert that an array is empty.
 *
 * @remarks
 * Not inlined because doing so causes TypeScript to infer the array type as never[] afterwards and breaks push.
 * Better than asserting length is 0 as this gets a better error message on failure.
 */
function assertLogEmpty(log: string[]): void {
	assert.deepEqual(log, []);
}
