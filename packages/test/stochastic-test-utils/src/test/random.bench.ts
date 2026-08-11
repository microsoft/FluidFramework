/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmarkDuration, benchmarkIt } from "@fluid-tools/benchmark";
import { MersenneTwister19937, integer, real } from "random-js";

import { makeRandom } from "../random.js";
import { XSadd } from "../xsadd.js";

const mtEngine = MersenneTwister19937.autoSeed();

benchmarkIt({
	title: "'random-js': raw MT19937 (uint32)",
	...benchmarkDuration({ benchmarkFn: () => mtEngine.next() }),
});

benchmarkIt({
	title: "'random-js': integer (ideal)",
	...benchmarkDuration({ benchmarkFn: () => integer(0, 1)(mtEngine) }),
});

benchmarkIt({
	title: "'random-js': integer (pathological)",
	...benchmarkDuration({ benchmarkFn: () => integer(0, 2 ** 52)(mtEngine) }),
});

benchmarkIt({
	title: "'random-js': real",
	...benchmarkDuration({ benchmarkFn: () => real(0, 1)(mtEngine) }),
});

benchmarkIt({
	title: "Stochastic: raw XSadd (uint32)",
	...benchmarkDuration({ benchmarkFn: new XSadd().uint32 }),
});

const stochastic = makeRandom();

benchmarkIt({
	title: "Stochastic: integer (ideal)",
	...benchmarkDuration({ benchmarkFn: () => stochastic.integer(0, 1) }),
});

benchmarkIt({
	title: "Stochastic: integer (pathological)",
	...benchmarkDuration({ benchmarkFn: () => stochastic.integer(0, 2 ** 52) }),
});

benchmarkIt({
	title: "Stochastic: real",
	...benchmarkDuration({ benchmarkFn: () => stochastic.real(0, 1) }),
});

benchmarkIt({
	title: "Stochastic: normal",
	...benchmarkDuration({ benchmarkFn: () => stochastic.normal() }),
});
