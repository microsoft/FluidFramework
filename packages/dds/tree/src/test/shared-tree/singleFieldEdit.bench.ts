/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { benchmarkDurationBatchless, benchmarkIt } from "@fluid-tools/benchmark";

import { Tree, independentView } from "../../shared-tree/index.js";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { makeArray } from "../../util/index.js";
import { configureBenchmarkHooks } from "../utils.js";

const schemaFactory = new SchemaFactory("singleFieldEditBenchmark");
class Item extends schemaFactory.object("Item", { value: schemaFactory.number }) {}
class Items extends schemaFactory.array("Items", Item) {}
const config = new TreeViewConfiguration({ schema: Items });

describe("Single field edit benchmarks", () => {
	configureBenchmarkHooks();

	const editCount = 100;

	benchmarkIt({
		title: `set a property of each of ${editCount} nodes in a transaction`,
		...benchmarkDurationBatchless({
			benchmarkFn: (state) => {
				let running: boolean;
				let value = 0;
				do {
					const view = independentView(config);
					view.initialize(makeArray(editCount, (index) => new Item({ value: index })));
					value++;
					running = state.time(() => {
						Tree.runTransaction(view, () => {
							for (const item of view.root) {
								item.value = value;
							}
						});
					});
					assert.equal(view.root[editCount - 1]?.value, value);
					view.dispose();
				} while (running);
			},
		}),
	});

	benchmarkIt({
		title: `insert ${editCount} nodes one at a time in a transaction`,
		...benchmarkDurationBatchless({
			benchmarkFn: (state) => {
				let running: boolean;
				do {
					const view = independentView(config);
					view.initialize([]);
					running = state.time(() => {
						Tree.runTransaction(view, () => {
							for (let index = 0; index < editCount; index++) {
								view.root.insertAtEnd(new Item({ value: index }));
							}
						});
					});
					assert.equal(view.root.length, editCount);
					view.dispose();
				} while (running);
			},
		}),
	});
});
