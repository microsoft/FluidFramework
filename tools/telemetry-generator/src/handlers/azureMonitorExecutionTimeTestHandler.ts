/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = async function handler(fileData, logger) {
    fileData.benchmarks.forEach(async (testData) => {
        // logger.send({
        //     category: "performance",
        //     eventName: "Benchmark",
        //     benchmarkType: "ExecutionTime",
        //     suiteName: fileData.suiteName,
        //     benchmarkName: testData.benchmarkName,
        //     arithmeticMean: testData.stats.arithmeticMean,
        //     marginOfError: testData.stats.marginOfError,
        // });

        const arithmeticMeanMetricName = `${fileData.suiteName}_${testData.benchmarkName}_arithmeticMean`;
        await logger.trackMetric({
            name: arithmeticMeanMetricName,
            value: testData.stats.arithmeticMean,
            namespace: "performance_benchmark_executionTime",
            properties: {
                buildId: process.env.BUILD_ID,
                branchName: process.env.BRANCH_NAME,
                category: "performance",
                eventName: "Benchmark",
                benchmarkType: "ExecutionTime",
                suiteName: fileData.suiteName,
                benchmarkName: testData.benchmarkName,
            }
        });

        const marginOfErrorMetricName = `${fileData.suiteName}_${testData.benchmarkName}_marginOfError`;
        await logger.trackMetric({
            name: marginOfErrorMetricName,
            value: testData.stats.marginOfError,
            namespace: "performance_benchmark_executionTime",
            properties: {
                buildId: process.env.BUILD_ID,
                branchName: process.env.BRANCH_NAME,
                category: "performance",
                eventName: "Benchmark",
                benchmarkType: "ExecutionTime",
                suiteName: fileData.suiteName,
                benchmarkName: testData.benchmarkName,
            }
        });

    });
};
