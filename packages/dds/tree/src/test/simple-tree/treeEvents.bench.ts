/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Off } from "@fluidframework/core-interfaces";
import {
	BenchmarkType,
	benchmarkDuration,
	benchmarkIt,
	benchmarkMemoryUse,
	memoryAddedBy,
} from "@fluid-tools/benchmark";

import { SchemaFactory, type TreeNode } from "../../simple-tree/index.js";
import { Tree } from "../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { iterationSettings } from "../memory/utils.js";
import { configureBenchmarkHooks } from "../utils.js";

import { hydrate } from "./utils.js";

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

	const makeObject = (): ObjectRoot =>
		hydrate(ObjectRoot, { a: 0, b: 0, c: "", inner: { x: 0, y: 0 } });
	const makeUnhydratedObject = (): ObjectRoot =>
		new ObjectRoot({ a: 0, b: 0, c: "", inner: new Inner({ x: 0, y: 0 }) });
	const makeArray = (): NumberArray => hydrate(NumberArray, [0, 1, 2, 3, 4]);
	const makeMap = (): StringMap => hydrate(StringMap, new Map([["k0", "v0"]]));

	// A no-op listener that is shared across iterations so that we don't measure
	// listener-creation cost.
	const noopNodeChanged = (): void => {};
	const noopTreeChanged = (): void => {};

	// -------------------------------------------------------------------------
	// Registration (sub + unsub round-trip) — CPU
	// -------------------------------------------------------------------------

	describe("Tree.on subscribe + unsubscribe round-trip (hydrated)", () => {
		interface Scenario {
			readonly title: string;
			readonly eventName: "nodeChanged" | "treeChanged";
			readonly makeNode: () => TreeNode;
		}
		const scenarios: readonly Scenario[] = [
			{ title: "object nodeChanged", eventName: "nodeChanged", makeNode: makeObject },
			{ title: "object treeChanged", eventName: "treeChanged", makeNode: makeObject },
			{ title: "array nodeChanged", eventName: "nodeChanged", makeNode: makeArray },
			{ title: "array treeChanged", eventName: "treeChanged", makeNode: makeArray },
			{ title: "map nodeChanged", eventName: "nodeChanged", makeNode: makeMap },
			{ title: "map treeChanged", eventName: "treeChanged", makeNode: makeMap },
		];

		for (const { title, eventName, makeNode } of scenarios) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const node = makeNode();
						const listener =
							eventName === "nodeChanged" ? noopNodeChanged : noopTreeChanged;
						state.timeAllBatches(() => {
							const off = Tree.on(node, eventName, listener);
							off();
						});
					},
				}),
			});
		}
	});

	describe("Tree.on subscribe + unsubscribe round-trip (unhydrated)", () => {
		benchmarkIt({
			type: BenchmarkType.Measurement,
			title: "object nodeChanged",
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					const node = makeUnhydratedObject();
					state.timeAllBatches(() => {
						const off = Tree.on(node, "nodeChanged", noopNodeChanged);
						off();
					});
				},
			}),
		});
		benchmarkIt({
			type: BenchmarkType.Measurement,
			title: "object treeChanged",
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					const node = makeUnhydratedObject();
					state.timeAllBatches(() => {
						const off = Tree.on(node, "treeChanged", noopTreeChanged);
						off();
					});
				},
			}),
		});
	});

	// -------------------------------------------------------------------------
	// First-listener vs N-th listener cost (hydrated object)
	// -------------------------------------------------------------------------

	describe("Tree.on N-th listener cost (hydrated object nodeChanged)", () => {
		for (const preexisting of [0, 1, 10, 100]) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `with ${preexisting} pre-existing listeners`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const node = makeObject();
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

	// -------------------------------------------------------------------------
	// Bulk N subscribes then N unsubscribes — measures amortised per-call cost
	// without the unsubscribe being interleaved between subscribes.
	// -------------------------------------------------------------------------

	describe("Tree.on bulk subscribe + bulk unsubscribe (hydrated object nodeChanged)", () => {
		for (const n of [1, 10, 100]) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `${n} subscribes + ${n} unsubscribes`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const node = makeObject();
						const offs: Off[] = new Array<Off>(n);
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
	});

	// -------------------------------------------------------------------------
	// Kernel construction cost — relevant to the "lazy buffer" proposal which
	// affects per-node overhead even before any listener is attached.
	// -------------------------------------------------------------------------

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
						const seed: number[] = new Array(n).fill(0);
						state.timeAllBatches(() => {
							const node = new NumberArray(seed);
							assert(node.length === n);
						});
					},
				}),
			});
		}
	});

	// -------------------------------------------------------------------------
	// Emission cost — relevant to A (shared dispatcher), F (storedKey
	// short-circuit), and D (subscription sharing).
	// -------------------------------------------------------------------------

	describe("Tree.on emission cost (hydrated object nodeChanged)", () => {
		for (const numListeners of [1, 10, 100]) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `emit with ${numListeners} listeners`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const node = makeObject();
						const offs: Off[] = [];
						for (let i = 0; i < numListeners; i++) {
							offs.push(Tree.on(node, "nodeChanged", () => {}));
						}
						state.timeAllBatches(() => {
							// Mutating a property emits nodeChanged synchronously
							// (the internal childrenChangedAfterBatch event fires after
							// the change is applied).
							node.a = node.a + 1;
						});
						for (const off of offs) off();
					},
				}),
			});
		}
	});

	// -------------------------------------------------------------------------
	// Memory benchmarks
	//
	// Only unhydrated benchmarks are included: hydrated trees would dominate the
	// measurement with the cost of building a full SharedTree per iteration
	// (~80 KiB and tens of seconds per iteration in practice). Per-node and
	// per-subscription allocations can be observed clearly on unhydrated nodes,
	// which is what proposals A, C, and H primarily affect.
	// -------------------------------------------------------------------------

	describe("Memory: unhydrated kernel construction", () => {
		for (const n of [100, 1000]) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `${n} unhydrated ObjectRoot instances`,
				...benchmarkMemoryUse({
					...iterationSettings,
					...memoryAddedBy({
						setup: () => ({ nodes: [] as ObjectRoot[] }),
						modify: (state) => {
							for (let i = 0; i < n; i++) {
								state.nodes.push(
									new ObjectRoot({
										a: 0,
										b: 0,
										c: "",
										inner: new Inner({ x: 0, y: 0 }),
									}),
								);
							}
						},
						after: (state) => {
							state.nodes.length = 0;
						},
					}),
				}),
			});
		}
	});

	describe("Memory: per-subscription retained allocations (unhydrated object)", () => {
		for (const eventName of ["nodeChanged", "treeChanged"] as const) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `${eventName} x 100`,
				...benchmarkMemoryUse({
					...iterationSettings,
					...memoryAddedBy({
						setup: () => {
							const node = makeUnhydratedObject();
							return { node, offs: [] as Off[] };
						},
						modify: (state) => {
							const listener =
								eventName === "nodeChanged" ? noopNodeChanged : noopTreeChanged;
							for (let i = 0; i < 100; i++) {
								state.offs.push(Tree.on(state.node, eventName, listener));
							}
						},
						after: (state) => {
							for (const off of state.offs) off();
							state.offs.length = 0;
						},
					}),
				}),
			});
		}
	});
});
