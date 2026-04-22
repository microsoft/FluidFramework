/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestType, benchmarkIt, collectDurationData } from "@fluid-tools/benchmark";
import { MersenneTwister19937, integer, real } from "random-js";

import { makeRandom } from "../random.js";
import { XSadd } from "../xsadd.js";

benchmarkIt({
	testType: TestType.ExecutionTime,
	title: "'random-js': raw MT19937 (uint32)",
	run: async () => {
		const engine = MersenneTwister19937.autoSeed();
		return collectDurationData({ benchmarkFn: () => engine.next() });
	},
});

benchmarkIt({
	testType: TestType.ExecutionTime,
	title: "'random-js': integer (ideal)",
	run: async () => {
		const engine = MersenneTwister19937.autoSeed();
		return collectDurationData({ benchmarkFn: () => integer(0, 1)(engine) });
	},
});

benchmarkIt({
	testType: TestType.ExecutionTime,
	title: "'random-js': integer (pathological)",
	run: async () => {
		const engine = MersenneTwister19937.autoSeed();
		return collectDurationData({ benchmarkFn: () => integer(0, 2 ** 52)(engine) });
	},
});

benchmarkIt({
	testType: TestType.ExecutionTime,
	title: "'random-js': real",
	run: async () => {
		const engine = MersenneTwister19937.autoSeed();
		return collectDurationData({ benchmarkFn: () => real(0, 1)(engine) });
	},
});

benchmarkIt({
	testType: TestType.ExecutionTime,
	title: "Stochastic: raw XSadd (uint32)",
	run: async () => {
		return collectDurationData({ benchmarkFn: new XSadd().uint32 });
	},
});

benchmarkIt({
	testType: TestType.ExecutionTime,
	title: "Stochastic: integer (ideal)",
	run: async () => {
		const random = makeRandom();
		return collectDurationData({ benchmarkFn: () => random.integer(0, 1) });
	},
});

benchmarkIt({
	testType: TestType.ExecutionTime,
	title: "Stochastic: integer (pathological)",
	run: async () => {
		const random = makeRandom();
		return collectDurationData({ benchmarkFn: () => random.integer(0, 2 ** 52) });
	},
});

benchmarkIt({
	testType: TestType.ExecutionTime,
	title: "Stochastic: real",
	run: async () => {
		const random = makeRandom();
		return collectDurationData({ benchmarkFn: () => random.real(0, 1) });
	},
});

benchmarkIt({
	testType: TestType.ExecutionTime,
	title: "Stochastic: normal",
	run: async () => {
		const random = makeRandom();
		return collectDurationData({ benchmarkFn: () => random.normal() });
	},
});
