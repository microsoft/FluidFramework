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
			driverEndpointName: process.env.FLUID_ENDPOINTNAME ?? "",
			eventName: "Benchmark",
			benchmarkType: "CustomBenchmark",
			suiteName: fileData.suiteName,
			benchmarkName: testData.benchmarkName,
			customData: JSON.stringify(testData.customData),
		});
	}
};
