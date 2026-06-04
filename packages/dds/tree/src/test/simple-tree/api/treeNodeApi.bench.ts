/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmarkDuration, benchmarkIt } from "@fluid-tools/benchmark";

import { Tree } from "../../../shared-tree/index.js";
import { SchemaFactory, type TreeNode } from "../../../simple-tree/index.js";
import { configureBenchmarkHooks } from "../../utils.js";
import { describeHydration } from "../utils.js";

describe("Tree node API benchmarks", () => {
	configureBenchmarkHooks();

	// Benchmark suite for `Tree.on` event registration and emission.
	describe("Tree event benchmarks", () => {
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

		// No-op listeners that are shared across iterations so that we don't measure listener-creation cost.
		const noopNodeChanged = (): void => {};
		const noopTreeChanged = (): void => {};

		/**
		 * Canonical insertable shape for `ObjectRoot` used by most runtime benchmarks below.
		 */
		const createObjectRootContent = (): {
			a: number;
			b: number;
			c: string;
			inner: Inner;
		} => ({ a: 0, b: 0, c: "", inner: new Inner({ x: 0, y: 0 }) });

		describe("Runtime", () => {
			describeHydration("Tree.on - subscribe + unsubscribe round-trip", (init) => {
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
							title: `${title} ${eventName}`,
							...benchmarkDuration({
								benchmarkFnCustom: async (state) => {
									const node = makeNode();
									state.timeAllBatches(() => {
										Tree.on(node, eventName, listener);
									});
								},
							}),
						});
					}
				}
			});

			describeHydration("Tree.on - N-th listener cost (object nodeChanged)", (init) => {
				for (const preexisting of [0, 1, 10, 100]) {
					benchmarkIt({
						title: `with ${preexisting} pre-existing listeners`,
						...benchmarkDuration({
							benchmarkFnCustom: async (state) => {
								const node = init(ObjectRoot, createObjectRootContent());
								for (let i = 0; i < preexisting; i++) {
									Tree.on(node, "nodeChanged", noopNodeChanged);
								}
								state.timeAllBatches(() => {
									Tree.on(node, "nodeChanged", noopNodeChanged);
								});
							},
						}),
					});
				}
			});

			describeHydration(
				"Tree.on - bulk subscribe + bulk unsubscribe (object nodeChanged)",
				(init) => {
					for (const n of [1, 10, 100]) {
						benchmarkIt({
							title: `${n} subscribes + ${n} unsubscribes`,
							...benchmarkDuration({
								benchmarkFnCustom: async (state) => {
									const node = init(ObjectRoot, createObjectRootContent());
									state.timeAllBatches(() => {
										for (let i = 0; i < n; i++) {
											Tree.on(node, "nodeChanged", noopNodeChanged);
										}
									});
								},
							}),
						});
					}
				},
			);

			describeHydration("Tree.on - edit + emission cost (object nodeChanged)", (init) => {
				for (const listenerCount of [1, 10, 100]) {
					benchmarkIt({
						title: `emit with ${listenerCount} listeners`,
						...benchmarkDuration({
							benchmarkFnCustom: async (state) => {
								const node = init(ObjectRoot, createObjectRootContent());
								for (let i = 0; i < listenerCount; i++) {
									Tree.on(node, "nodeChanged", noopNodeChanged);
								}
								state.timeAllBatches(() => {
									node.a = node.a + 1;
								});
							},
						}),
					});
				}
			});

			describeHydration(
				"Tree.on - edit + emission cost (object treeChanged, subtree edit)",
				(init) => {
					for (const listenerCount of [1, 10, 100]) {
						benchmarkIt({
							title: `emit with ${listenerCount} listeners`,
							...benchmarkDuration({
								benchmarkFnCustom: async (state) => {
									const node = init(ObjectRoot, createObjectRootContent());
									for (let i = 0; i < listenerCount; i++) {
										Tree.on(node, "treeChanged", noopNodeChanged);
									}
									state.timeAllBatches(() => {
										node.inner.x = node.inner.x + 1;
									});
								},
							}),
						});
					}
				},
			);
		});
	});
});
