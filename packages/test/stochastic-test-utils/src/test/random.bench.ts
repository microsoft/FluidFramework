/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { MersenneTwister19937, integer, real } from "random-js";
import { makeRandom } from "../random";
import { XSadd } from "../xsadd";

let next: () => number;

benchmark({
	type: BenchmarkType.Measurement,
	title: "'random-js': raw MT19937 (uint32)",
	before: () => {
		const engine = MersenneTwister19937.autoSeed();
		next = () => engine.next();
	},
	benchmarkFn: () => next(),
});

benchmark({
	type: BenchmarkType.Measurement,
	title: "'random-js': integer (ideal)",
	before: () => {
		const engine = MersenneTwister19937.autoSeed();
		next = () => integer(0, 1)(engine);
	},
	benchmarkFn: () => next(),
});

benchmark({
	type: BenchmarkType.Measurement,
	title: "'random-js': integer (pathological)",
	before: () => {
		const engine = MersenneTwister19937.autoSeed();
		next = () => integer(0, 2 ** 52)(engine);
	},
	benchmarkFn: () => next(),
});

benchmark({
	type: BenchmarkType.Measurement,
	title: "'random-js': real",
	before: () => {
		const engine = MersenneTwister19937.autoSeed();
		next = () => real(0, 1)(engine);
	},
	benchmarkFn: () => next(),
});

benchmark({
	type: BenchmarkType.Measurement,
	title: "Stochastic: raw XSadd (uint32)",
	before: () => {
		next = new XSadd().uint32;
	},
	benchmarkFn: () => next(),
});

benchmark({
	type: BenchmarkType.Measurement,
	title: "Stochastic: integer (ideal)",
	before: () => {
		const random = makeRandom();
		next = () => random.integer(0, 1);
	},
	benchmarkFn: () => next(),
});

benchmark({
	type: BenchmarkType.Measurement,
	title: "Stochastic: integer (pathological)",
	before: () => {
		const random = makeRandom();
		next = () => random.integer(0, 2 ** 52);
	},
	benchmarkFn: () => next(),
});

benchmark({
	type: BenchmarkType.Measurement,
	title: "Stochastic: real",
	before: () => {
		const random = makeRandom();
		next = () => random.real(0, 1);
	},
	benchmarkFn: () => next(),
});

benchmark({
	type: BenchmarkType.Measurement,
	title: "Stochastic: normal",
	before: () => {
		const random = makeRandom();
		next = () => random.normal();
	},
	benchmarkFn: () => next(),
});
