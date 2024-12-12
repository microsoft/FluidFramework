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
		for (const customDataKey of Object.keys(testData.customData)) {
			const customDataName = `${fileData.suiteName}_${testData.benchmarkName}_${customDataKey}`;

			try {
				console.log(
					`emitting metric '${customDataName}' with value '${testData.customData[customDataKey]}'`,
				);
				telemetryClient.trackMetric({
					name: customDataName,
					value: testData.customData[customDataKey],
					namespace: "performance_benchmark_customData",
					properties: {
						buildId: process.env.BUILD_ID,
						branchName: process.env.BRANCH_NAME,
						category: "performance",
						eventName: "Benchmark",
						benchmarkType: "CustomBenchmark",
						suiteName: fileData.suiteName,
						benchmarkName: testData.benchmarkName,
						driverEndpointName: process.env.FLUID_ENDPOINTNAME ?? "",
					},
				});
			} catch (error) {
				console.error(`failed to emit metric '${customDataName}'`, error);
			}
		}
	}
};
