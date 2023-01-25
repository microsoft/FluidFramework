/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This is a template for how to define a handler file that can be passed to this tool to process
 * arbitrary JSON files.
 */
module.exports = function handler(fileData, logger) {
    // - fileData is a JSON object obtained by calling JSON.parse() on the contents of a file.
    // - logger is an ITelemetryBufferedLogger. Call its send() method to write the output telemetry
    //   events.
        if (fileData.assets?.length === undefined || fileData.assets?.length === 0) {
            console.log(`could not locate assets info`);
        }

        for (const asset of fileData.assets) {
            if (asset.size > 0 ) {
                logger.send({
                    category: "performance",
                    eventName: "Benchmark",
                    benchmarkType: "BundleSize",
                    name: asset.name,
                    size: asset.size,
                });
            }
        }
};
