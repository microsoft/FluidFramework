/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmark, BenchmarkType, isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import { averageTwoValues, sumDirect } from "./benchmarks";
import { generateTwitterJsonByByteSize, Twitter } from "./twitter";
import { Canada, generateCanada } from "./canada";
import { clone } from "./jsObjectUtil";

/**
 * Performance test suite that measures a variety of access patterns using the direct JS objects to compare its performance when using ITreeCursor.
 */
export function jsObjectBench(
	data: {
		name: string;
		getJson: () => any;
		dataConsumer: (directObj: any, calculate: (...operands: any[]) => void) => any;
	}[],
) {
	for (const { name, getJson, dataConsumer } of data) {
		const json = getJson();

		benchmark({
			type: BenchmarkType.Measurement,
			title: `clone JS Object: '${name}'`,
			before: () => {
				const cloned = clone(json);
				assert.deepEqual(cloned, json, "clone() must return an equivalent tree.");
				assert.notEqual(cloned, json, "clone() must not return the same tree instance.");
			},
			benchmarkFn: () => {
				clone(json);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `sum JS Object: '${name}'`,
			before: () => {},
			benchmarkFn: () => {
				sumDirect(json);
			},
		});

		benchmark({
			type: BenchmarkType.Measurement,
			title: `averageTwoValues JS Object: '${name}'`,
			before: () => {},
			benchmarkFn: () => {
				averageTwoValues(json, dataConsumer);
			},
		});
	}
}

function extractCoordinatesFromCanadaDirect(
	directObj: Canada,
	calculate: (x: number, y: number) => void,
): void {
	for (const feature of directObj.features) {
		for (const coordinates of feature.geometry.coordinates) {
			for (const [x, y] of coordinates) {
				calculate(x, y);
			}
		}
	}
}

function extractAvgValsFromTwitterDirect(
	directObj: Twitter,
	calculate: (x: number, y: number) => void,
): void {
	for (const status of directObj.statuses) {
		calculate(status.retweet_count, status.favorite_count);
	}
}

const canada = generateCanada(
	// Use the default (large) data set for benchmarking, otherwise use a small dataset.
	isInPerformanceTestingMode ? undefined : [2, 10],
);

// The original benchmark twitter.json is 466906 Bytes according to getSizeInBytes.
const twitter = generateTwitterJsonByByteSize(isInPerformanceTestingMode ? 2500000 : 466906, true);

describe("Direct Object", () => {
	jsObjectBench([
		{ name: "canada", getJson: () => canada, dataConsumer: extractCoordinatesFromCanadaDirect },
	]);
	jsObjectBench([
		{ name: "twitter", getJson: () => twitter, dataConsumer: extractAvgValsFromTwitterDirect },
	]);
});
