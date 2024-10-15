/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TelemetryClient } from "applicationinsights";
import sinon from "sinon";

const handler = require("../handlers/appInsightsExecutionTimeTestHandler");
describe("appInsightsExecutionTimeTestHandler", () => {
	let mockTelemetryClient: TelemetryClient;

	beforeEach(() => {
		mockTelemetryClient = {
			trackMetric: () => {},
		} as unknown as TelemetryClient;
	});

	it("should emit valid metrics to Azure App Insights", () => {
		const mockFileData = {
			suiteName: "TestSuite",
			benchmarks: [
				{
					benchmarkName: "Benchmark1",
					customData: {
						"Period (ns/op)": 21265156.7,
						"Margin of Error": 0.99,
					},
				},
			],
		};

		const trackMetricSpy = sinon.spy(mockTelemetryClient, "trackMetric");
		handler(mockFileData, mockTelemetryClient);

		assert.strictEqual(trackMetricSpy.calledTwice, true);
		assert.strictEqual(
			trackMetricSpy.calledWith({
				name: "TestSuite_Benchmark1_arithmeticMean",
				value: 21265156.7,
				namespace: "performance_benchmark_executionTime",
				properties: {
					buildId: undefined,
					branchName: undefined,
					category: "performance",
					eventName: "Benchmark",
					benchmarkType: "ExecutionTime",
					suiteName: "TestSuite",
					benchmarkName: "Benchmark1",
					driverEndpointName: "",
				},
			}),
			true,
		);

		assert.strictEqual(
			trackMetricSpy.calledWith({
				name: "TestSuite_Benchmark1_marginOfError",
				value: 0.99,
				namespace: "performance_benchmark_executionTime",
				properties: {
					buildId: undefined,
					branchName: undefined,
					category: "performance",
					eventName: "Benchmark",
					benchmarkType: "ExecutionTime",
					suiteName: "TestSuite",
					benchmarkName: "Benchmark1",
				},
			}),
			true,
		);

		trackMetricSpy.restore();
	});

	it("should skip track metrics for invalid value", () => {
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

		const trackMetricSpy = sinon.spy(mockTelemetryClient, "trackMetric");
		handler(mockFileData, mockTelemetryClient);

		assert.strictEqual(trackMetricSpy.calledOnce, true);

		assert.strictEqual(
			trackMetricSpy.calledWith({
				name: "TestSuite_Benchmark1_marginOfError",
				value: 0.99,
				namespace: "performance_benchmark_executionTime",
				properties: {
					buildId: process.env.BUILD_ID,
					branchName: process.env.BRANCH_NAME,
					category: "performance",
					eventName: "Benchmark",
					benchmarkType: "ExecutionTime",
					suiteName: "TestSuite",
					benchmarkName: "Benchmark1",
				},
			}),
			true,
		);

		trackMetricSpy.restore();
	});
});
