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
		const heapUsedAvg = testData.customData["Heap Used Avg"];
		const heapUsedStdDev = testData.customData["Heap Used StdDev"];
		if (Number.isNaN(Number.parseFloat(heapUsedAvg))) {
			throw new TypeError(`'${heapUsedAvg}' is not a number ('Heap Used Avg')`);
		}
		if (Number.isNaN(Number.parseFloat(heapUsedStdDev))) {
			throw new TypeError(`'${heapUsedStdDev}' is not a number ('Heap Used StdDev')`);
		}
		logger.send({
			namespace: "FFEngineering", // Transfer the telemetry associated with tests performance measurement to namespace "FFEngineering"
			category: "performance",
			eventName: "Benchmark",
			benchmarkType: "MemoryUsage",
			suiteName: fileData.suiteName,
			testName: testData.benchmarkName,
			heapUsedAvg,
			heapUsedStdDev,
			driverEndpointName: process.env.FLUID_ENDPOINTNAME ?? "",
		});
	}
};
