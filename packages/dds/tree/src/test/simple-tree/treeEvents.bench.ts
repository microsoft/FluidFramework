/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkType,
	benchmarkDuration,
	benchmarkIt,
	benchmarkMemoryUse,
	memoryAddedBy,
} from "@fluid-tools/benchmark";
import type { Off } from "@fluidframework/core-interfaces";

import { Tree } from "../../shared-tree/index.js";
import { SchemaFactory, type TreeNode } from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { iterationSettings } from "../memory/utils.js";
import { configureBenchmarkHooks } from "../utils.js";

import { describeHydration } from "./utils.js";

/**
 * Benchmark suite for `Tree.on` event registration and emission.
 */
describe("Tree event benchmarks", () => {
	configureBenchmarkHooks();

	const factory = new SchemaFactory("treeEvents.bench");

	class Inner extends factory.object("Inner", {
		x: factory.number,
		y: factory.number,
	}) {}
	class ObjectRoot extends factory.object("ObjectRoot", {
		a: factory.number,
		b: factory.number,
		c: factory.string,
		inner: Inner,
	}) {}
	class NumberArray extends factory.array("NumberArray", factory.number) {}
	class StringMap extends factory.map("StringMap", factory.string) {}

	const createUnhydratedObject = (): ObjectRoot =>
		new ObjectRoot({ a: 0, b: 0, c: "", inner: new Inner({ x: 0, y: 0 }) });

	// A no-op listener that is shared across iterations so that we don't measure
	// listener-creation cost.
	const noopNodeChanged = (): void => {};
	const noopTreeChanged = (): void => {};

	// Canonical insertable shape for `ObjectRoot` used by most CPU benchmarks
	// below.
	const createObjectRootContent = (): {
		a: number;
		b: number;
		c: string;
		inner: Inner;
	} => ({ a: 0, b: 0, c: "", inner: new Inner({ x: 0, y: 0 }) });

	describe("Runtime", () => {
		describeHydration("Tree.on subscribe + unsubscribe round-trip", (init) => {
			interface Scenario {
				readonly title: string;
				readonly makeNode: () => TreeNode;
			}
			const scenarios: readonly Scenario[] = [
				{
					title: "object",
					makeNode: () => init(ObjectRoot, createObjectRootContent()),
				},
				{
					title: "array",
					makeNode: () => init(NumberArray, [0, 1, 2, 3, 4]),
				},
				{
					title: "map",
					makeNode: () => init(StringMap, new Map([["k0", "v0"]])),
				},
			];

			for (const { title, makeNode } of scenarios) {
				for (const eventName of ["nodeChanged", "treeChanged"] as const) {
					const listener = eventName === "nodeChanged" ? noopNodeChanged : noopTreeChanged;
					benchmarkIt({
						type: BenchmarkType.Measurement,
						title: `${title} ${eventName}`,
						...benchmarkDuration({
							benchmarkFnCustom: async (state) => {
								const node = makeNode();
								state.timeAllBatches(() => {
									const off = Tree.on(node, eventName, listener);
									off();
								});
							},
						}),
					});
				}
			}
		});

		// First-listener vs N-th listener cost (object nodeChanged)
		describeHydration("Tree.on N-th listener cost (object nodeChanged)", (init) => {
			for (const preexisting of [0, 1, 10, 100]) {
				benchmarkIt({
					type: BenchmarkType.Measurement,
					title: `with ${preexisting} pre-existing listeners`,
					...benchmarkDuration({
						benchmarkFnCustom: async (state) => {
							const node = init(ObjectRoot, createObjectRootContent());
							// Pre-attach listeners (each call uses a unique listener since
							// Tree.on's internal wrapper deduplicates by identity).
							const preOffs: Off[] = [];
							for (let i = 0; i < preexisting; i++) {
								preOffs.push(Tree.on(node, "nodeChanged", () => {}));
							}
							state.timeAllBatches(() => {
								const off = Tree.on(node, "nodeChanged", noopNodeChanged);
								off();
							});
							for (const off of preOffs) off();
						},
					}),
				});
			}
		});

		// Bulk N subscribes then N unsubscribes — measures amortized per-call cost
		// without the unsubscribe being interleaved between subscribes.
		describeHydration(
			"Tree.on bulk subscribe + bulk unsubscribe (object nodeChanged)",
			(init) => {
				for (const n of [1, 10, 100]) {
					benchmarkIt({
						type: BenchmarkType.Measurement,
						title: `${n} subscribes + ${n} unsubscribes`,
						...benchmarkDuration({
							benchmarkFnCustom: async (state) => {
								const node = init(ObjectRoot, createObjectRootContent());
								const offs: Off[] = Array.from({ length: n });
								state.timeAllBatches(() => {
									for (let i = 0; i < n; i++) {
										offs[i] = Tree.on(node, "nodeChanged", noopNodeChanged);
									}
									for (let i = 0; i < n; i++) {
										offs[i]();
									}
								});
							},
						}),
					});
				}
			},
		);

		describe("Kernel construction (unhydrated object node)", () => {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: "new ObjectRoot() x 1",
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						state.timeAllBatches(() => {
							const node = new ObjectRoot({
								a: 0,
								b: 0,
								c: "",
								inner: new Inner({ x: 0, y: 0 }),
							});
							assert(node !== undefined);
						});
					},
				}),
			});

			for (const n of [100, 1000]) {
				benchmarkIt({
					type: BenchmarkType.Measurement,
					title: `new NumberArray with ${n} elements`,
					...benchmarkDuration({
						benchmarkFnCustom: async (state) => {
							const seed: number[] = Array.from<number>({ length: n }).fill(0);
							state.timeAllBatches(() => {
								const node = new NumberArray(seed);
								assert(node.length === n);
							});
						},
					}),
				});
			}
		});

		describeHydration("Tree.on emission cost (object nodeChanged)", (init) => {
			for (const numListeners of [1, 10, 100]) {
				benchmarkIt({
					type: BenchmarkType.Measurement,
					title: `emit with ${numListeners} listeners`,
					...benchmarkDuration({
						benchmarkFnCustom: async (state) => {
							const node = init(ObjectRoot, createObjectRootContent());
							const offs: Off[] = [];
							for (let i = 0; i < numListeners; i++) {
								offs.push(Tree.on(node, "nodeChanged", () => {}));
							}
							state.timeAllBatches(() => {
								node.a = node.a + 1;
							});
							for (const off of offs) {
								off();
							}
						},
					}),
				});
			}
		});

		describeHydration("Tree.on emission cost (object treeChanged, subtree edit)", (init) => {
			for (const numListeners of [1, 10, 100]) {
				benchmarkIt({
					type: BenchmarkType.Measurement,
					title: `emit with ${numListeners} listeners`,
					...benchmarkDuration({
						benchmarkFnCustom: async (state) => {
							const node = init(ObjectRoot, createObjectRootContent());
							const offs: Off[] = [];
							for (let i = 0; i < numListeners; i++) {
								offs.push(Tree.on(node, "treeChanged", () => {}));
							}
							state.timeAllBatches(() => {
								node.inner.x = node.inner.x + 1;
							});
							for (const off of offs) {
								off();
							}
						},
					}),
				});
			}
		});
	});

	describe("Memory", () => {
		describe("Per-subscription retained allocations (unhydrated object)", () => {
			for (const eventName of ["nodeChanged", "treeChanged"] as const) {
				benchmarkIt({
					type: BenchmarkType.Measurement,
					title: `${eventName} x ${10}`,
					...benchmarkMemoryUse({
						...iterationSettings,
						...memoryAddedBy({
							setup: () => {
								const node = createUnhydratedObject();
								return { node, offs: [] as Off[] };
							},
							modify: (state) => {
								const listener =
									eventName === "nodeChanged" ? noopNodeChanged : noopTreeChanged;
								for (let i = 0; i < 10; i++) {
									state.offs.push(Tree.on(state.node, eventName, listener));
								}
							},
							after: (state) => {
								for (const off of state.offs) {
									off();
								}
								state.offs.length = 0;
							},
						}),
					}),
				});
			}
		});
	});
});
