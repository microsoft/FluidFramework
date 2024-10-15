/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TelemetryClient } from "applicationinsights";
import sinon from "sinon";

const handler = require("../handlers/appInsightsMemoryUsageTestHandler");

describe("appInsightsMemoryUsageTestHandler", () => {
	let mockTelemetryClient: TelemetryClient;

	beforeEach(() => {
		mockTelemetryClient = {
			trackMetric: () => {},
		} as unknown as TelemetryClient;
	});

	it("should emit heap used avg and std dev metrics to Azure App Insights", () => {
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
		const trackMetricSpy = sinon.spy(mockTelemetryClient, "trackMetric");
		handler(mockFileData, mockTelemetryClient);

		assert.strictEqual(trackMetricSpy.calledTwice, true);

		assert.strictEqual(
			trackMetricSpy.calledWith({
				name: "TestSuite_Benchmark1_heapUsedAvg",
				value: 123.45,
				namespace: "performance_benchmark_memoryUsage",
				properties: {
					buildId: process.env.BUILD_ID,
					branchName: process.env.BRANCH_NAME,
					category: "performance",
					eventName: "Benchmark",
					benchmarkType: "MemoryUsage",
					suiteName: "TestSuite",
					testName: "Benchmark1",
				},
			}),
			true,
		);

		assert.strictEqual(
			trackMetricSpy.calledWith({
				name: "TestSuite_Benchmark1_heapUsedStdDev",
				value: 67.89,
				namespace: "performance_benchmark_memoryUsage",
				properties: {
					buildId: process.env.BUILD_ID,
					branchName: process.env.BRANCH_NAME,
					category: "performance",
					eventName: "Benchmark",
					benchmarkType: "MemoryUsage",
					suiteName: "TestSuite",
					testName: "Benchmark1",
				},
			}),
			true,
		);

		trackMetricSpy.restore();
	});

	it("should skip metrics if values are not numbers", () => {
		const mockFileData = {
			suiteName: "TestSuite",
			benchmarks: [
				{
					benchmarkName: "Benchmark1",
					customData: {
						"Heap Used Avg": 123.45,
						"Heap Used StdDev": "NaN",
					},
				},
			],
		};

		const trackMetricSpy = sinon.spy(mockTelemetryClient, "trackMetric");
		handler(mockFileData, mockTelemetryClient);

		assert.strictEqual(trackMetricSpy.calledOnce, true);

		assert.strictEqual(
			trackMetricSpy.calledWith({
				name: "TestSuite_Benchmark1_heapUsedAvg",
				value: 123.45,
				namespace: "performance_benchmark_memoryUsage",
				properties: {
					buildId: process.env.BUILD_ID,
					branchName: process.env.BRANCH_NAME,
					category: "performance",
					eventName: "Benchmark",
					benchmarkType: "MemoryUsage",
					suiteName: "TestSuite",
					testName: "Benchmark1",
				},
			}),
			true,
		);

		trackMetricSpy.restore();
	});
});
