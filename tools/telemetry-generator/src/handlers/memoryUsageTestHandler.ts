/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = function handler(fileData, logger): void {
	if (process.env.FLUID_ENDPOINTNAME === undefined) {
		console.log("ENDPOINTNAME not defined using local as default.");
	} else {
		console.log("ENDPOINTNAME", process.env.FLUID_ENDPOINTNAME);
	}

	for (const testData of fileData.benchmarks) {
		logger.send({
			namespace: "FFEngineering", // Transfer the telemetry associated with tests performance measurement to namespace "FFEngineering"
			category: "performance",
			eventName: "Benchmark",
			benchmarkType: "MemoryUsage",
			suiteName: fileData.suiteName,
			testName: testData.benchmarkName,
			heapUsedAvg: testData.customData["Heap Used Avg"],
			heapUsedStdDev: testData.customData["Heap Used StdDev"],
			driverEndpointName: process.env.FLUID_ENDPOINTNAME ?? "",
		});
	}
};
