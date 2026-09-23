/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { generatorLayout } from "./benchmark-generator-layout.mjs";

test("preserves four generators by default", () => {
	assert.deepEqual(generatorLayout({ documents: 32, rate: 1000 }), {
		count: 4,
		cpus: [16, 18, 20, 22],
	});
});

test("supports eight generators on separate physical cores", () => {
	assert.deepEqual(
		generatorLayout({
			documents: 32,
			rate: 76_000,
			generator: "native",
			generatorProcesses: 8,
		}),
		{
			count: 8,
			cpus: [16, 18, 20, 22, 24, 26, 28, 30],
		},
	);
});

test("rejects uneven document and native-rate partitions", () => {
	assert.throws(
		() => generatorLayout({ documents: 4, rate: 100, generatorProcesses: 3 }),
		/documents must divide evenly/u,
	);
	assert.throws(
		() =>
			generatorLayout({
				documents: 32,
				rate: 101,
				generator: "native",
				generatorProcesses: 4,
			}),
		/native rate must divide evenly/u,
	);
});
