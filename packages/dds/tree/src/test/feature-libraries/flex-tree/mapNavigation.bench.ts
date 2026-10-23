/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	benchmarkDurationBatchless,
	benchmarkIt,
	BenchmarkType,
} from "@fluid-tools/benchmark";
import { unreachableCase } from "@fluidframework/core-utils/internal";

import {
	createIndependentTreeAlpha,
	ForestTypeOptimized,
	ForestTypeReference,
} from "../../../shared-tree/index.js";
import { SchemaFactoryAlpha, TreeViewConfiguration } from "../../../simple-tree/index.js";
import { configureBenchmarkHooks } from "../../utils.js";

describe("Dynamic field navigation benchmarks", () => {
	configureBenchmarkHooks();
	const sf = new SchemaFactoryAlpha("dynamic-field-navigation");
	class ValuesMap extends sf.map("Map", sf.number) {}
	class ValuesRecord extends sf.record("Record", sf.number) {}
	const configuration = new TreeViewConfiguration({ schema: [ValuesMap, ValuesRecord] });
	const adapters = [
		{
			name: "Map",
			create: () => {
				const node = new ValuesMap({ value: 1 });
				return {
					node,
					read: (key: string) => node.get(key),
					set: (key: string, value: number) => node.set(key, value),
					remove: (key: string) => node.delete(key),
				};
			},
		},
		{
			name: "Record",
			create: () => {
				const node = new ValuesRecord({ value: 1 });
				return {
					node,
					read: (key: string) => node[key],
					set: (key: string, value: number) => {
						node[key] = value;
					},
					remove: (key: string) => {
						Reflect.deleteProperty(node, key);
					},
				};
			},
		},
	];

	for (const adapter of adapters) {
		for (const [name, forest] of [
			["Unhydrated", undefined],
			["ChunkedForest", ForestTypeOptimized],
			["ObjectForest", ForestTypeReference],
		] as const) {
			for (const operation of ["Read leaf", "Read missing", "Key churn"] as const) {
				benchmarkIt({
					title: `${adapter.name} ${name} ${operation}`,
					type: BenchmarkType.Measurement,
					...benchmarkDurationBatchless({
						benchmarkFn: (state) => {
							const build = () => {
								const instance = adapter.create();
								if (forest !== undefined) {
									createIndependentTreeAlpha({ forest })
										.viewWith(configuration)
										.initialize(instance.node);
								}
								return instance;
							};
							let access = build();
							let samples = 0;
							let running: boolean;
							do {
								running = state.time(() => {
									switch (operation) {
										case "Read leaf": {
											assert.equal(access.read("value"), 1);
											break;
										}
										case "Read missing": {
											assert.equal(access.read("missing"), undefined);
											break;
										}
										case "Key churn": {
											const key = `key-${samples}`;
											access.set(key, 2);
											assert.equal(access.read(key), 2);
											access.remove(key);
											assert.equal(access.read(key), undefined);
											break;
										}
										default: {
											unreachableCase(operation);
										}
									}
								});
								// Discard edit history outside the timed region.
								if (++samples === 256) {
									access = build();
									samples = 0;
								}
							} while (running);
						},
						maxBenchmarkDurationSeconds: 1,
					}),
				});
			}
		}
	}
});
