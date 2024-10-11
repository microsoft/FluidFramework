/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TelemetryClient } from "applicationinsights";
import sinon from "sinon";

const handler = require("../handlers/appInsightsCustomBenchmarkHandler");

describe("appInsightsCustomBenchmarkHandler", () => {
	let mockTelemetryClient: TelemetryClient;

	beforeEach(() => {
		mockTelemetryClient = {
			trackMetric: () => {},
		} as unknown as TelemetryClient;
	});

	it("should emit metrics to Azure App Insights", () => {
		const mockFileData = {
			suiteName: "TestSuite",
			benchmarks: [
				{
					benchmarkName: "Benchmark1",
					customData: {
						metric1: 100,
						metric2: 200,
					},
				},
				{
					benchmarkName: "Benchmark2",
					customData: {
						metric3: 300,
					},
				},
			],
		};
		const trackMetricSpy = sinon.spy(mockTelemetryClient, "trackMetric");
		handler(mockFileData, mockTelemetryClient);

		assert.strictEqual(trackMetricSpy.calledThrice, true);
		assert.strictEqual(
			trackMetricSpy.calledWith({
				name: "TestSuite_Benchmark1_metric1",
				value: 100,
				namespace: "performance_benchmark_customData",
				properties: {
					buildId: process.env.BUILD_ID,
					suiteName: "TestSuite",
					benchmarkName: "Benchmark1",
					benchmarkType: "CustomBenchmark",
					branchName: process.env.BRANCH_NAME,
					category: "performance",
					eventName: "Benchmark",
					driverEndpointName: process.env.FLUID_ENDPOINTNAME ?? "",
				},
			}),
			true,
		);

		assert.strictEqual(
			trackMetricSpy.calledWith({
				name: "TestSuite_Benchmark1_metric2",
				value: 200,
				namespace: "performance_benchmark_customData",
				properties: {
					buildId: process.env.BUILD_ID,
					suiteName: "TestSuite",
					benchmarkName: "Benchmark1",
					benchmarkType: "CustomBenchmark",
					branchName: process.env.BRANCH_NAME,
					category: "performance",
					eventName: "Benchmark",
					driverEndpointName: process.env.FLUID_ENDPOINTNAME ?? "",
				},
			}),
			true,
		);

		assert.strictEqual(
			trackMetricSpy.calledWith({
				name: "TestSuite_Benchmark2_metric3",
				value: 300,
				namespace: "performance_benchmark_customData",
				properties: {
					buildId: process.env.BUILD_ID,
					suiteName: "TestSuite",
					benchmarkName: "Benchmark2",
					benchmarkType: "CustomBenchmark",
					branchName: process.env.BRANCH_NAME,
					category: "performance",
					eventName: "Benchmark",
					driverEndpointName: process.env.FLUID_ENDPOINTNAME ?? "",
				},
			}),
			true,
		);

		trackMetricSpy.restore();
	});
});
