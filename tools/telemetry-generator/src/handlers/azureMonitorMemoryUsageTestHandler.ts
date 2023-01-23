/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = async function handler(fileData, logger) {
    fileData.tests.forEach(async (testData) => {
        const heapUsedAvgMetricName = `performance_benchmark_memoryUsage_${fileData.suiteName}_${testData.benchmarkName}_heapUsedAvg`;
        const heapUsedStdDevMetricName = `performance_benchmark_memoryUsage_${fileData.suiteName}_${testData.benchmarkName}_heapUsedStdDev`;
        // logger.send({
        //     category: "performance",
        //     eventName: "Benchmark",
        //     benchmarkType: "MemoryUsage",
        //     suiteName: fileData.suiteName,
        //     testName: testData.testName,
        //     heapUsedAvg: testData.testData.stats.mean,
        //     heapUsedStdDev: testData.testData.stats.deviation,
        // });
        await logger.trackMetric({ name: heapUsedAvgMetricName, value: testData.testData.stats.mean }, {
            category: "performance",
            eventName: "Benchmark",
            benchmarkType: "MemoryUsage",
            suiteName: fileData.suiteName,
            testName: testData.testName,
        });
        await logger.trackMetric({ name: heapUsedStdDevMetricName, value: testData.testData.stats.deviation }, {
            category: "performance",
            eventName: "Benchmark",
            benchmarkType: "MemoryUsage",
            suiteName: fileData.suiteName,
            testName: testData.testName,
        });
    });
};
