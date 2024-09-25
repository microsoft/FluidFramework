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
module.exports = function handler(fileData, logger): void {
	// eslint-disable-next-line @rushstack/no-new-null -- External API can return an actual null
	if (fileData.resultSummary === null || fileData.resultSummary === undefined) {
		console.log(`Could not locate test result info.`);
		return;
	}

	if (process.env.BUILD_ID === undefined) {
		throw new Error("BUILD_ID environment variable is not set.");
	}
	if (process.env.PIPELINE === undefined) {
		throw new Error("PIPELINE environment variable is not set.");
	}
	if (process.env.STAGE_ID === undefined) {
		throw new Error("STAGE_ID environment variable is not set.");
	}

	console.log("BUILD_ID:", process.env.BUILD_ID);
	console.log("PIPELINE:", process.env.PIPELINE);
	console.log("STAGE_ID:", process.env.STAGE_ID);

	const resultSummary = fileData.resultSummary.resultSummaryByRunState.Completed;
	console.log(resultSummary);

	const passedTests: number = resultSummary.aggregatedResultDetailsByOutcome.Passed?.count ?? 0;
	const failedTests: number = resultSummary.aggregatedResultDetailsByOutcome.Failed?.count ?? 0;
	const totalTests = passedTests + failedTests;
	const passRate = totalTests === 0 ? 0 : passedTests / totalTests;
	console.log("Pass rate:", passRate);

	logger.send({
		namespace: "FFEngineering", // Transfer the telemetry associated with test passing rate to namespace "FFEngineering"
		category: "performance",
		eventName: "TestPassRate",
		benchmarkType: "PipelineInfo",
		stageName: fileData.currentContext.stageReference.stageName,
		passedTests,
		failedTests,
		totalTests: resultSummary.totalTestCount,
		result: passRate,
		duration: resultSummary.duration,
		buildId: process.env.BUILD_ID ?? "",
		name: process.env.PIPELINE ?? "",
	});
};
