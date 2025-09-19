/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";
import * as React from "react";

import { useObservation } from "../useObservation.js";

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

		for (const reactStrictMode of [false, true]) {
			/**
			 * Check then clear, the contents of `log`.
			 *
			 * When in StrictMode, React may double render, so that case is not checked for an exact match.
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
						return useObservation(
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
						rendered.baseElement.querySelector("button") ?? assert.fail("button not found");
					button.click();

					checkRenderLog(log, ["click", "invalidated"]);

					rendered.rerender(content);

					checkRenderLog(log, [
						"render",
						...(reactStrictMode ? ["unsubscribe"] : []),
						"useObservation",
					]);
				});

				// This requires waiting for finalizers, and thus is slow, so skipped for now.
				it.skip("unsubscribe on unmount", async () => {
					assert(global.gc);

					const log: string[] = [];

					const unsubscribe = (): void => {
						log.push("unsubscribe");
					};

					function TestComponent(): JSX.Element {
						return useObservation((invalidate) => ({
							result: <br />,
							unsubscribe,
						}));
					}

					const rendered = render(<TestComponent />, { reactStrictMode });

					assertLogEmpty(log);
					rendered.unmount();

					// Unsubscribe on unmount is done via FinalizationRegistry, so force a GC and wait for it.
					// For this to pass on NodeJs, a wait of 8 seconds seems to be required.
					for (let index = 0; index < 10; index++) {
						global.gc({ type: "major", execution: "sync" });
						if (log.length > 0) {
							break;
						}
						await new Promise((resolve) => setTimeout(resolve, 1000));
					}

					checkRenderLog(log, ["unsubscribe"]);
				}).timeout(12000);
			});
		}
	});
});

/**
 * Assert that an array is empty.
 *
 * Not inlined because doing so causes TypeScript to infer the array type as never[] afterwards and breaks push.
 * Better than asserting length is 0 as this gets a better error message on failure.
 */
function assertLogEmpty(log: string[]): void {
	assert.deepEqual(log, []);
}
