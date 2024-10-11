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
		const arithmeticMeanMetricName = `${fileData.suiteName}_${testData.benchmarkName}_arithmeticMean`;
		try {
			const value = testData.customData["Period (ns/op)"];
			if (Number.isNaN(Number.parseFloat(value))) {
				console.error(
					`skipping metric '${arithmeticMeanMetricName}' with value '${value}' as it is not a number`,
				);
			} else {
				console.log(`emitting metric '${arithmeticMeanMetricName}' with value '${value}'`);
				telemetryClient.trackMetric({
					name: arithmeticMeanMetricName,
					value,
					namespace: "performance_benchmark_executionTime",
					properties: {
						buildId: process.env.BUILD_ID,
						branchName: process.env.BRANCH_NAME,
						category: "performance",
						eventName: "Benchmark",
						benchmarkType: "ExecutionTime",
						suiteName: fileData.suiteName,
						benchmarkName: testData.benchmarkName,
						driverEndpointName: process.env.FLUID_ENDPOINTNAME ?? "",
					},
				});
			}
		} catch (error) {
			console.error(`failed to emit metric '${arithmeticMeanMetricName}'`, error);
		}

		const marginOfErrorMetricName = `${fileData.suiteName}_${testData.benchmarkName}_marginOfError`;
		try {
			const value = testData.customData["Margin of Error"];
			if (Number.isNaN(Number.parseFloat(value))) {
				console.error(
					`skipping metric '${marginOfErrorMetricName}' with value '${value}' as it is not a number`,
				);
			} else {
				console.log(`emitting metric '${marginOfErrorMetricName}' with value '${value}'`);
				telemetryClient.trackMetric({
					name: marginOfErrorMetricName,
					value,
					namespace: "performance_benchmark_executionTime",
					properties: {
						buildId: process.env.BUILD_ID,
						branchName: process.env.BRANCH_NAME,
						category: "performance",
						eventName: "Benchmark",
						benchmarkType: "ExecutionTime",
						suiteName: fileData.suiteName,
						benchmarkName: testData.benchmarkName,
					},
				});
			}
		} catch (error) {
			console.error(`failed to emit metric '${marginOfErrorMetricName}'`, error);
		}
	}
};
