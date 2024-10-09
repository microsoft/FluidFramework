/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import sinon from "sinon";

const executionTimeHandler = require("../handlers/executionTimeTestHandler");

describe("executionTimeTestHandler", () => {
	let mockLogger;

	beforeEach(() => {
		mockLogger = {
			send: sinon.spy(),
		};
	});

	it("should emit execution time avg and Margin of Error metrics to logger", () => {
		const mockFileData = {
			suiteName: "TestSuite",
			benchmarks: [
				{
					benchmarkName: "Benchmark1",
					customData: {
						"Period (ns/op)": 123.45,
						"Margin of Error": 0.99,
					},
				},
			],
		};
		executionTimeHandler(mockFileData, mockLogger);

		assert.strictEqual(mockLogger.send.calledOnce, true);
		assert.strictEqual(
			mockLogger.send.calledWith({
				namespace: "FFEngineering",
				category: "performance",
				eventName: "Benchmark",
				benchmarkType: "ExecutionTime",
				suiteName: "TestSuite",
				benchmarkName: "Benchmark1",
				arithmeticMean: 123.45,
				marginOfError: 0.99,
				driverEndpointName: "",
			}),
			true,
		);
	});

	it("should throw an error for invalid Period (ns/op) metric", () => {
		const mockFileData = {
			suiteName: "TestSuite",
			benchmarks: [
				{
					benchmarkName: "Benchmark1",
					customData: {
						"Period (ns/op)": "invalid",
						"Margin of Error": 0.99,
					},
				},
			],
		};

		assert.throws(
			() => executionTimeHandler(mockFileData, mockLogger),
			/'invalid' is not a number \('Period \(ns\/op\)'\)/,
		);
	});

	it("should throw an error for invalid Margin of Error metric", () => {
		const mockFileData = {
			suiteName: "TestSuite",
			benchmarks: [
				{
					benchmarkName: "Benchmark1",
					customData: {
						"Period (ns/op)": 123.45,
						"Margin of Error": "invalid",
					},
				},
			],
		};

		assert.throws(
			() => executionTimeHandler(mockFileData, mockLogger),
			/'invalid' is not a number \('Margin of Error'\)/,
		);
	});
});
