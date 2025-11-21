/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import * as React from "react";

import {
	useObservation,
	useObservationStrict,
	useObservationWithEffects,
} from "../useObservation.js";

// There is much more coverage of useObservation via useTree tests.

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
					// eslint-disable-next-line no-inner-declarations
					function checkRenderLog(log: string[], expected: readonly string[]): void {
						if (reactStrictMode) {
							assert.deepEqual(new Set(log), new Set(expected));
						} else {
							assert.deepEqual(log, expected);
						}
						log.length = 0;
					}

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
							checkRenderLog(log, ["render", "useObservation"]);

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

							assertLogEmpty(log);
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

							checkRenderLog(log, ["render"]);

							// After unmount, unsubscribe could happen at any time due to finalizer,so suppress logging it to prevent the test from possibly becoming flaky.
							logUnsubscribe = false;

							rendered.unmount();

							assert(invalidateCallbacks.length === (reactStrictMode ? 2 : 1));

							// Invalidate after unmount.
							// Since this can happen in real use, due to unsubscribe delay while waiting for finalizer, ensure it does not cause issues.
							// This should be a no-op, but since it does a React SetState after unmount, React could object to it.
							for (const callback of invalidateCallbacks) {
								callback();
							}

							// Confirm the invalidation happened..
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
