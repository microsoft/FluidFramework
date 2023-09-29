/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This handler uses the timeline and metrics REST APIs to retrieve the test pass rate of the pipeline:
 * Ex. https://dev.azure.com/fluidframework/internal/_apis/build/builds/<buildId>/timeline?api-version=7.1-preview.1
 * Ex. https://vstmr.dev.azure.com/fluidframework/internal/_apis/testresults/metrics?pipelineId=<buildId>&stageName=<stageName>&api-version=7.1-preview.1
 * @param fileData - A JSON object obtained by calling JSON.parse() on the contents of a file.
 * @param logger - An ITelemetryBufferedLogger. Call its send() method to write the output telemetry events.
 */
module.exports = function handler(fileData, logger) {

	if (fileData.records?.length === undefined || fileData.records?.length === 0) {
		console.log(`could not locate records info`);
	}
	if (process.env.BUILD_ID !== undefined) {
		console.log("BUILD_ID", process.env.BUILD_ID);
	} else {
		console.log("BUILD_ID not defined.");
	}
	const resultSummary = fileData.resultSummary.resultSummaryByRunState.Completed;

	const passedTests: number = resultSummary.aggregatedResultDetailsByOutcome.Passed?.count ?? 0;
	const failedTests: number = resultSummary.aggregatedResultDetailsByOutcome.Failed?.count ?? 0;
	const totalTests = passedTests + failedTests;
	const passRate = totalTests !== 0 ? passedTests / totalTests : 0;

	logger.send({
		category: "performance",
		eventName: "TestPassRate",
		benchmarkType: "PipelineInfo",
		stageName: fileData.currentContext.stageReference.stageName,
		passedTests,
		failedTests,
		totalTests: resultSummary.totalTestCount,
		passRate,
		duration: resultSummary.duration,
		buildId: process.env.BUILD_ID ?? "",
		name: process.env.PIPELINE ?? "",
	});
};
