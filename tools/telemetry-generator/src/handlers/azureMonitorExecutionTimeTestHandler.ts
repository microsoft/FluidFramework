/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = async function handler(fileData, logger) {
    fileData.benchmarks.forEach(async (testData) => {
        const arithmeticMeanMetricName = `performance_benchmark_executionTime_${fileData.suiteName}_${testData.benchmarkName}_arithmeticMean`;
        const marginOfErrorMetricName = `performance_benchmark_executionTime_${fileData.suiteName}_${testData.benchmarkName}_marginOfError`;

        // logger.send({
        //     category: "performance",
        //     eventName: "Benchmark",
        //     benchmarkType: "ExecutionTime",
        //     suiteName: fileData.suiteName,
        //     benchmarkName: testData.benchmarkName,
        //     arithmeticMean: testData.stats.arithmeticMean,
        //     marginOfError: testData.stats.marginOfError,
        // });

        // await logger.trackMetric({name: arithmeticMeanMetricName, value: testData.stats.arithmeticMean}, {
        //     category: "performance",
        //     eventName: "Benchmark",
        //     benchmarkType: "ExecutionTime",
        //     suiteName: fileData.suiteName,
        //     benchmarkName: testData.benchmarkName,
        // });

        const eventName = `performance_benchmark_executionTime_${fileData.suiteName}_${testData.benchmarkName}`;
        await logger.trackEvent({
            name: eventName,
            category: "performance",
            eventName: "Benchmark",
            benchmarkType: "ExecutionTime",
            suiteName: fileData.suiteName,
            benchmarkName: testData.benchmarkName,
            arithmeticMean: testData.stats.arithmeticMean,
            marginOfError: testData.stats.marginOfError,
        });
        // await logger.trackMetric({name: marginOfErrorMetricName, value: testData.stats.marginOfError}, {
        //     category: "performance",
        //     eventName: "Benchmark",
        //     benchmarkType: "ExecutionTime",
        //     suiteName: fileData.suiteName,
        //     benchmarkName: testData.benchmarkName,
        // });

    });
};
