/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This handler uses the TemeletryClient as its logger which is from the 'applicationinsights' Azure package.
 */
module.exports = async function handler(fileData, logger) {
    fileData.benchmarks.forEach(async (testData) => {
        const arithmeticMeanMetricName = `${fileData.suiteName}_${testData.benchmarkName}_arithmeticMean`;
        try {
            console.log(`emitting metric ${arithmeticMeanMetricName} with value ${testData.stats.arithmeticMean}`)
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
        } catch (error) {
            console.error(`failed to emit metric ${arithmeticMeanMetricName}`, error);
        }

        const marginOfErrorMetricName = `${fileData.suiteName}_${testData.benchmarkName}_marginOfError`;
        try {
            console.log(`emitting metric ${arithmeticMeanMetricName} with value ${testData.stats.marginOfError}`)
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
        } catch (error) {
            console.error(`failed to emit metric ${marginOfErrorMetricName}`, error);
        }


    });
};
