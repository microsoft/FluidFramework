/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { benchmarkDurationBatchless, benchmarkIt } from "@fluid-tools/benchmark";

import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { configureBenchmarkHooks, TestTreeProviderLite } from "../utils.js";

const schemaFactory = new SchemaFactory("trimHistoryBenchmark");
class Items extends schemaFactory.array("Items", schemaFactory.number) {}
const config = new TreeViewConfiguration({ schema: Items });

describe("Trimming history benchmarks", () => {
	configureBenchmarkHooks();

	const editCount = 100;

	benchmarkIt({
		title: `sequence ${editCount} inserts one at a time between two peers`,
		...benchmarkDurationBatchless({
			benchmarkFn: (state) => {
				let running: boolean;
				do {
					const provider = new TestTreeProviderLite(2);
					const [sender, receiver] = provider.trees;
					const senderView = sender.viewWith(config);
					senderView.initialize([]);
					provider.synchronizeMessages();
					const receiverView = receiver.viewWith(config);
					running = state.time(() => {
						for (let index = 0; index < editCount; index++) {
							senderView.root.insertAtEnd(index);
							provider.synchronizeMessages();
						}
					});
					assert.equal(receiverView.root.length, editCount);
					senderView.dispose();
					receiverView.dispose();
				} while (running);
			},
		}),
	});
});
