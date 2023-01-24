/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = async function handler(fileData, logger) {
    fileData.tests.forEach(async (testData) => {
        // logger.send({
        //     category: "performance",
        //     eventName: "Benchmark",
        //     benchmarkType: "MemoryUsage",
        //     suiteName: fileData.suiteName,
        //     testName: testData.testName,
        //     heapUsedAvg: testData.testData.stats.mean,
        //     heapUsedStdDev: testData.testData.stats.deviation,
        // });

        const heapUsedAvgMetricName = `${fileData.suiteName}_${testData.benchmarkName}_heapUsedAvg`;
        await logger.trackMetric({
             name: heapUsedAvgMetricName,
             value: testData.testData.stats.mean,
             namespace: 'performance_benchmark_memoryUsage',
             properties: {
                 category: "performance",
                 eventName: "Benchmark",
                 benchmarkType: "MemoryUsage",
                 suiteName: fileData.suiteName,
                 testName: testData.testName,
             }
         });

        const heapUsedStdDevMetricName = `${fileData.suiteName}_${testData.benchmarkName}_heapUsedStdDev`;
        await logger.trackMetric({
            name: heapUsedStdDevMetricName,
            value: testData.testData.stats.deviation,
            namespace: 'performance_benchmark_memoryUsage',
            properties: {
                category: "performance",
                eventName: "Benchmark",
                benchmarkType: "MemoryUsage",
                suiteName: fileData.suiteName,
                testName: testData.testName,
            }
        });
    });
};
