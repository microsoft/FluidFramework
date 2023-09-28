/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

interface ParsedTestResult {
	stageName: string;
	totalTime: number;
	passedTests: number;
	failedTests: number;
	totalTests: number;
	passRate: number;
}

module.exports = function handler(fileData, logger) {
	// - fileData is a JSON object obtained by calling JSON.parse() on the contents of a file.
	// In this particular handler, we are using the timeline and metrics REST API to retrieve the test pass rate of the pipeline:
	// Ex. https://dev.azure.com/fluidframework/internal/_apis/build/builds/<buildId>/timeline?api-version=6.0-preview.1
	// - logger is an ITelemetryBufferedLogger. Call its send() method to write the output telemetry
	//   events.
	if (fileData.records?.length === undefined || fileData.records?.length === 0) {
		console.log(`could not locate records info`);
	}
	if (process.env.BUILD_ID !== undefined) {
		console.log("BUILD_ID", process.env.BUILD_ID);
	} else {
		console.log("BUILD_ID not defined.");
	}
	const currentContext = fileData.currentContext;
	const resultSummary = fileData.resultSummary.resultSummaryByRunState.Completed;

	const stageName = currentContext.stageReference.stageName;
	const passedTests: number = resultSummary.aggregatedResultDetailsByOutcome.Passed?.count;
	const failedTests: number = resultSummary.aggregatedResultDetailsByOutcome.Failed?.count;
	const passRate = passedTests / (passedTests + failedTests);

	logger.send({
		category: "performance",
		eventName: "TestPassRate",
		benchmarkType: "PipelineInfo",
		stageName,
		passedTests,
		failedTests,
		totalTests: resultSummary.totalTestCount,
		passRate,
		duration: resultSummary.duration,
		buildId: process.env.BUILD_ID ?? "",
		name: process.env.PIPELINE ?? "",
	});
};
