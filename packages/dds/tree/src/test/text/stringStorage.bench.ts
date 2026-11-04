/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkType,
	benchmarkDurationBatchless,
	benchmarkIt,
	benchmarkMemoryUse,
	isInPerformanceTestingMode,
	memoryUseOfValue,
} from "@fluid-tools/benchmark";

import { createIndependentTreeAlpha, ForestTypeOptimized } from "../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { ForestTypeStringPrototype } from "../../shared-tree/forestTypeStringPrototype.js";
import { TreeViewConfiguration } from "../../simple-tree/index.js";
import { PlainText } from "../../text/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { plainTextFromString } from "../../text/textDomain.js";
import { configureBenchmarkHooks } from "../utils.js";

describe("PlainText string storage benchmark", () => {
	configureBenchmarkHooks();
	for (const [name, forest] of [
		["baseline", ForestTypeOptimized],
		["pieces", ForestTypeStringPrototype],
	] as const) {
		for (const size of isInPerformanceTestingMode ? [10_000, 100_000] : [100]) {
			const create = () => {
				const view = createIndependentTreeAlpha({ forest }).viewWith(
					new TreeViewConfiguration({ schema: PlainText.Tree }),
				);
				view.initialize(PlainText.Tree.fromString(""));
				return view;
			};
			const text = "ab\u{1F600}".repeat(Math.floor(size / 3)) + "ab".slice(0, size % 3);
			for (const operation of ["fromString", "initialize"] as const) {
				benchmarkIt({
					type: BenchmarkType.Measurement,
					title: `${name} ${size} ${operation}`,
					...benchmarkDurationBatchless({
						benchmarkFn: (state) => {
							let running: boolean;
							do {
								const view =
									operation === "initialize"
										? createIndependentTreeAlpha({ forest }).viewWith(
												new TreeViewConfiguration({ schema: PlainText.Tree }),
											)
										: undefined;
								try {
									let result: PlainText.Tree | undefined;
									running = state.time(() => {
										const node = plainTextFromString(text, name === "pieces");
										result = node;
										view?.initialize(node);
									});
									assert(result !== undefined);
									assert.equal(result.characterCount(), size);
								} finally {
									view?.dispose();
								}
							} while (running);
						},
						maxBenchmarkDurationSeconds: 2,
						minSampleCount: 5,
					}),
				});
			}
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `${name} ${size} retained unhydrated fromString`,
				...benchmarkMemoryUse({
					...memoryUseOfValue(() => plainTextFromString(text, name === "pieces")),
					keepIterations: 4,
					warmUpIterations: 2,
				}),
			});
			for (const operation of ["paste", "read", "type"] as const) {
				benchmarkIt({
					type: BenchmarkType.Measurement,
					title: `${name} ${size} ${operation}`,
					...benchmarkDurationBatchless({
						benchmarkFn: (state) => {
							if (operation === "read") {
								const view = create();
								view.root.insertAt(0, text);
								try {
									while (state.time(() => view.root.fullString())) {
										// Reuse the same document; only the read is timed.
									}
								} finally {
									view.dispose();
								}
								return;
							}
							let running: boolean;
							do {
								const view = create();
								if (operation !== "paste") {
									view.root.insertAt(0, text);
								}
								try {
									running = state.time(() => {
										if (operation === "paste") {
											view.root.insertAt(0, text);
										} else {
											for (let i = 0; i < 100; i++) {
												view.root.insertAt(Math.floor(view.root.characterCount() / 2), "x");
											}
										}
									});
								} finally {
									view.dispose();
								}
							} while (running);
						},
						maxBenchmarkDurationSeconds: 2,
						minSampleCount: 5,
					}),
				});
			}
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `${name} ${size} retained checkout after paste`,
				...benchmarkMemoryUse({
					...memoryUseOfValue(() => {
						const view = create();
						view.root.insertAt(0, text);
						return view;
					}),
					keepIterations: 4,
					warmUpIterations: 2,
				}),
			});
		}
	}
});
