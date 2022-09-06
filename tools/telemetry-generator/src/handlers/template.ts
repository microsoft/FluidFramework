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

    // Do something with the file contents and write telemetry events to the logger. E.g
    //
    // fileData.individualTests.forEach((testData) => {
    //     logger.send({
    //         category: "performance",
    //         eventName: "Benchmark",
    //         benchmarkType: "<your-benchmark-type>",
    //         myProperty1: <get-value-from-fileData/testData>,
    //         myProperty2: <get-value-from-fileData/testData>,
    //     });
    // });
};
