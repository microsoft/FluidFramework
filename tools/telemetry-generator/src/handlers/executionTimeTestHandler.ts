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
		const arithmeticMean = testData.customData["Period (ns/op)"];
		const marginOfError = testData.customData["Margin of Error"];
		if (Number.isNaN(Number.parseFloat(arithmeticMean))) {
			throw new TypeError(`'${arithmeticMean}' is not a number ('Period (ns/op)')`);
		}

		if (Number.isNaN(Number.parseFloat(marginOfError))) {
			throw new TypeError(`'${marginOfError}' is not a number ('Margin of Error')`);
		}

		logger.send({
			namespace: "FFEngineering", // Transfer the telemetry associated with tests performance measurement to namespace "FFEngineering"
			category: "performance",
			eventName: "Benchmark",
			benchmarkType: "ExecutionTime",
			suiteName: fileData.suiteName,
			benchmarkName: testData.benchmarkName,
			arithmeticMean,
			marginOfError,
			driverEndpointName: process.env.FLUID_ENDPOINTNAME ?? "",
		});
	}
};
