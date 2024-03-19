/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = function handler(fileData, logger) {
	// - fileData is a JSON object obtained by calling JSON.parse() on the contents of a file.
	// - logger is an ITelemetryBufferedLogger. Call its send() method to write the output telemetry
	//   events.
	if (fileData.assets?.length === undefined || fileData.assets?.length === 0) {
		console.log(`could not locate assets info`);
	}

	for (const asset of fileData.assets) {
		// we only need .js files
		if (
			asset.size >= 0 &&
			asset.name !== undefined &&
			asset.name.toLowerCase().endsWith(".js") === true
		) {
			logger.send({
				namespace: "FFEngineering", // Transfer the telemetry associated with bundle size measurement to namespace "FFEngineering"
				category: "performance",
				eventName: "Benchmark",
				benchmarkType: "BundleSize",
				name: asset.name,
				size: asset.size,
			});
		}
	}
};
