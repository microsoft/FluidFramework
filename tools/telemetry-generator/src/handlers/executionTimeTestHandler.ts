/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = function handler(fileData, logger) {
	if (process.env.FLUID_ENDPOINTNAME !== undefined) {
		console.log("ENDPOINTNAME", process.env.FLUID_ENDPOINTNAME);
	} else {
		console.log("ENDPOINTNAME not defined using local as default.");
	}

	fileData.benchmarks.forEach((testData) => {
		logger.send({
			namespace: "FFEngineering", // Transfer the telemetry associated with tests performance measurement to namespace "FFEngineering"
			category: "performance",
			eventName: "Benchmark",
			benchmarkType: "ExecutionTime",
			suiteName: fileData.suiteName,
			benchmarkName: testData.benchmarkName,
			arithmeticMean: testData.stats.arithmeticMean,
			marginOfError: testData.stats.marginOfError,
			driverEndpointName: process.env.FLUID_ENDPOINTNAME ?? "",
		});
	});
};
