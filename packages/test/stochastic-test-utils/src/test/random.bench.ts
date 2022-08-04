/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { default as Random } from "random-js";
import { makeRandom } from "../random";
import { XSadd } from "../xsadd";

let uint32: () => number;

benchmark({
    type: BenchmarkType.Measurement,
    title: "'random-js' (raw)",
    before: () => {
        uint32 = Random.engines.mt19937().autoSeed();
    },
    benchmarkFn: () => uint32(),
});

benchmark({
    type: BenchmarkType.Measurement,
    title: "'random-js' (integer)",
    before: () => {
        const engine = Random.engines.mt19937().autoSeed();
        uint32 = () => Random.integer(0, 0xFFFFFFFF)(engine);
    },
    benchmarkFn: () => uint32(),
});

benchmark({
    type: BenchmarkType.Measurement,
    title: "'random-js' (real)",
    before: () => {
        const engine = Random.engines.mt19937().autoSeed();
        uint32 = () => Random.real(0, 1)(engine);
    },
    benchmarkFn: () => uint32(),
});

benchmark({
    type: BenchmarkType.Measurement,
    title: "Stochastic (raw XSadd.uint32)",
    before: () => {
        uint32 = new XSadd().uint32;
    },
    benchmarkFn: () => uint32(),
});

benchmark({
    type: BenchmarkType.Measurement,
    title: "Stochastic (integer)",
    before: () => {
        const random = makeRandom();
        uint32 = () => random.integer(0, 0xFFFFFFFF);
    },
    benchmarkFn: () => uint32(),
});

benchmark({
    type: BenchmarkType.Measurement,
    title: "Stochastic (real)",
    before: () => {
        const random = makeRandom();
        uint32 = () => random.real(0, 1);
    },
    benchmarkFn: () => uint32(),
});

benchmark({
    type: BenchmarkType.Measurement,
    title: "Stochastic (normal)",
    before: () => {
        const random = makeRandom();
        uint32 = () => random.normal();
    },
    benchmarkFn: () => uint32(),
});
