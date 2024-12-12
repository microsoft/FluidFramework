/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TelemetryClient } from "applicationinsights";

/**
 * This handler emits metrics to the Azure App Insights instance configured by the telemetryClient provided to this handler.
 * This handler expects the 'telemetryClient' arg to be TelemetryClient class from the 'applicationinsights' Azure package.
 */
module.exports = function handler(fileData, telemetryClient: TelemetryClient): void {
	console.log(`Found ${fileData.benchmarks.length} total benchmark tests to emit`);
	for (const testData of fileData.benchmarks) {
		const heapUsedAvgMetricName = `${fileData.suiteName}_${testData.benchmarkName}_heapUsedAvg`;
		try {
			const value = testData.customData["Heap Used Avg"];
			if (Number.isNaN(Number.parseFloat(value))) {
				console.error(
					`skipping metric '${heapUsedAvgMetricName}' with value '${value}' as it is not a number`,
				);
			} else {
				console.log(`emitting metric '${heapUsedAvgMetricName}' with value '${value}'`);
				telemetryClient.trackMetric({
					name: heapUsedAvgMetricName,
					value,
					namespace: "performance_benchmark_memoryUsage",
					properties: {
						buildId: process.env.BUILD_ID,
						branchName: process.env.BRANCH_NAME,
						category: "performance",
						eventName: "Benchmark",
						benchmarkType: "MemoryUsage",
						suiteName: fileData.suiteName,
						testName: testData.benchmarkName,
					},
				});
			}
		} catch (error) {
			console.error(`failed to emit metric '${heapUsedAvgMetricName}'`, error);
		}

		const heapUsedStdDevMetricName = `${fileData.suiteName}_${testData.benchmarkName}_heapUsedStdDev`;
		try {
			const value = testData.customData["Heap Used StdDev"];
			if (Number.isNaN(Number.parseFloat(value))) {
				console.error(
					`skipping metric '${heapUsedStdDevMetricName}' with value '${value}' as it is not a number`,
				);
			} else {
				console.log(`emitting metric '${heapUsedStdDevMetricName}' with value '${value}'`);
				telemetryClient.trackMetric({
					name: heapUsedStdDevMetricName,
					value,
					namespace: "performance_benchmark_memoryUsage",
					properties: {
						buildId: process.env.BUILD_ID,
						branchName: process.env.BRANCH_NAME,
						category: "performance",
						eventName: "Benchmark",
						benchmarkType: "MemoryUsage",
						suiteName: fileData.suiteName,
						testName: testData.benchmarkName,
					},
				});
			}
		} catch (error) {
			console.error(`failed to emit metric '${heapUsedStdDevMetricName}'`, error);
		}
	}
};
