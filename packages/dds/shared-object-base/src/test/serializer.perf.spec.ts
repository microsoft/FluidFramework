/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BenchmarkType,
	benchmarkDuration,
	benchmarkIt,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { FluidObjectHandle } from "@fluidframework/datastore/internal";

import { FluidSerializer } from "../serializer.js";

import { MockHandleContext, makeJson } from "./utils.js";

const context = new MockHandleContext();
const serializer = new FluidSerializer(context);
const handle = Object.assign(new FluidObjectHandle({}, "/", context), {
	bind: () => {},
});

const shallowNoHandles = makeJson(/* breadth: */ 2, /* depth: */ 2, () => ({}));
const size = isInPerformanceTestingMode ? 8 : 3;
const deepWithHandles = makeJson(/* breadth: */ size, /* depth: */ size, () => handle);

const shallowNoHandlesString = serializer.stringify(shallowNoHandles, handle);
const deepWithHandlesString = serializer.stringify(deepWithHandles, handle);

const encodeHandlesCases: [string, unknown][] = [
	["primitive", 0],
	["shallow (no handles)", shallowNoHandles],
	["deep (with handles)", deepWithHandles],
];

const stringifyCases: [string, unknown][] = [
	["primitive", 0],
	["shallow (no handles)", shallowNoHandles],
	["deep (with handles)", deepWithHandles],
];

const parseCases: [string, string][] = [
	["primitive", "0"],
	["shallow (no handles)", shallowNoHandlesString],
	["deep (with handles)", deepWithHandlesString],
];

describe("FluidSerializer", () => {
	describe("encode Handles", () => {
		for (const [name, value] of encodeHandlesCases) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `encode - ${name}`,
				...benchmarkDuration({
					benchmarkFn: () => {
						serializer.encode(value, handle);
					},
				}),
			});

			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `parse(stringify) - ${name}`,
				...benchmarkDuration({
					benchmarkFn: () => {
						serializer.parse(serializer.stringify(value, handle));
					},
				}),
			});
		}
	});

	describe("stringify", () => {
		for (const [name, value] of stringifyCases) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `JSON.stringify(encode) - ${name}`,
				...benchmarkDuration({
					benchmarkFn: () => {
						JSON.stringify(serializer.encode(value, handle));
					},
				}),
			});

			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `stringify - ${name}`,
				...benchmarkDuration({
					benchmarkFn: () => {
						serializer.stringify(value, handle);
					},
				}),
			});
		}
	});

	describe("parse", () => {
		for (const [name, value] of parseCases) {
			benchmarkIt({
				type: BenchmarkType.Measurement,
				title: `parse - ${name}`,
				...benchmarkDuration({
					benchmarkFn: () => {
						serializer.parse(value);
					},
				}),
			});
		}
	});
});
