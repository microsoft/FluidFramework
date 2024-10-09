/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import sinon from "sinon";

const memoryUsageHandler = require("../handlers/memoryUsageTestHandler");

describe("memoryUsageTestHandler", () => {
	let mockLogger;

	beforeEach(() => {
		mockLogger = {
			send: sinon.spy(),
		};
	});

	it("should emit heap used avg and std dev metrics to logger", () => {
		const mockFileData = {
			suiteName: "TestSuite",
			benchmarks: [
				{
					benchmarkName: "Benchmark1",
					customData: {
						"Heap Used Avg": 123.45,
						"Heap Used StdDev": 67.89,
					},
				},
			],
		};
		memoryUsageHandler(mockFileData, mockLogger);

		assert.strictEqual(mockLogger.send.calledOnce, true);
		assert.strictEqual(
			mockLogger.send.calledWith({
				namespace: "FFEngineering",
				category: "performance",
				eventName: "Benchmark",
				benchmarkType: "MemoryUsage",
				driverEndpointName: "",
				suiteName: "TestSuite",
				testName: "Benchmark1",
				heapUsedAvg: 123.45,
				heapUsedStdDev: 67.89,
			}),
			true,
		);
	});

	it("should throw an error for invalid heap used avg metric", () => {
		const mockFileData = {
			suiteName: "TestSuite",
			benchmarks: [
				{
					benchmarkName: "Benchmark1",
					customData: {
						"Heap Used Avg": "invalid",
						"Heap Used StdDev": 67.89,
					},
				},
			],
		};

		assert.throws(
			() => memoryUsageHandler(mockFileData, mockLogger),
			/'invalid' is not a number \('Heap Used Avg'\)/,
		);
	});

	it("should throw an error for invalid heap used std dev metric", () => {
		const mockFileData = {
			suiteName: "TestSuite",
			benchmarks: [
				{
					benchmarkName: "Benchmark1",
					customData: {
						"Heap Used Avg": 123.45,
						"Heap Used StdDev": "invalid",
					},
				},
			],
		};

		assert.throws(
			() => memoryUsageHandler(mockFileData, mockLogger),
			/'invalid' is not a number \('Heap Used StdDev'\)/,
		);
	});
});
