/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface to make it easier to parse json returned from the timeline REST API
 */
interface ParsedJob {
	stageName: string;
	startTime: number;
	finishTime: number;
	totalSeconds: number;
	state: string;
	result: string;
}

/**
 * This handler is used to process a JSON payload with timing and result data for one or more stages in a pipeline.
 * The payload is assumed to be the output from the ADO REST API that gives us information about a pipeline run.
 * The handler then sends telemetry events to Kusto with the processed data.
 *
 * It assumes the specified stage (or if no specific stage is specified, all other stages in the pipeline) has already
 * completed, and will throw otherwise.
 *
 * @param fileData - A JSON object obtained by calling JSON.parse() on the output of the ADO REST API that gives us
 * information about a pipeline run, i.e.
 * https://dev.azure.com/fluidframework/internal/_apis/build/builds/<buildId>/timeline?api-version=6.0-preview.1
 * @param logger - The `ITelemetryLogger` to use to output the extracted data.
 */
module.exports = function handler(fileData, logger): void {
	if (fileData.records?.length === undefined || fileData.records?.length === 0) {
		throw new Error("No records found in the input data.");
	}
	if (process.env.BUILD_ID === undefined) {
		throw new Error("BUILD_ID environment variable is not set.");
	}
	if (process.env.PIPELINE === undefined) {
		throw new Error("PIPELINE environment variable is not set.");
	}

	console.log("BUILD_ID:", process.env.BUILD_ID);
	console.log("PIPELINE:", process.env.PIPELINE);
	console.log("STAGE_ID:", process.env.STAGE_ID);

	const parsedJobs: ParsedJob[] = fileData.records
		// Note: type === "Task" or type === "Job" would include task-level (or job-level, respectively) telemetry.
		// It might be interesting in the future - for now we will only collect stage-level telemetry.
		// If given a specific STAGE_ID, only process that stage. Otherwise process all stages.
		.filter(
			(job) =>
				job.type === "Stage" &&
				(process.env.STAGE_ID === undefined || job.identifier === process.env.STAGE_ID),
		)
		.map((job): ParsedJob | undefined => {
			console.log(
				`Processing stage - name='${job.name}' identifier='${job.identifier}' state='${job.state}' result='${job.result}'`,
			);

			const finishTime = Date.parse(job.finishTime?.toString());
			if (Number.isNaN(finishTime)) {
				console.error(
					`Failed to parse finishTime '${job.finishTime}'. The specified pipeline stage might not have finished yet. Telemetry for this stage will not be sent.`,
				);
				return undefined;
			}

			// A null start time when 'state === completed' indicates the stage was skipped.
			// In that case set startTime = finishTime so duration ends up being 0.
			const startTime: number =
				job.state === "completed" && job.startTime === null
					? finishTime
					: Date.parse(job.startTime?.toString());
			if (Number.isNaN(startTime)) {
				console.error(
					`Failed to parse startTime '${job.startTime}'. Telemetry for this stage will not be sent.`,
				);
				return undefined;
			}

			return {
				// Using the 'identifier' property because that's the one available in the API response for test results,
				// and we want the values to be consistent so we can correlate them later.
				stageName: job.identifier,
				startTime,
				finishTime,
				totalSeconds: (finishTime - startTime) / 1000,
				state: job.state,
				result: job.result,
			};
		});

	for (const job of parsedJobs.filter((x) => x !== undefined)) {
		logger.send({
			namespace: "FFEngineering", // Transfer the telemetry associated with pipeline status to namespace "FFEngineering".
			category: "performance",
			eventName: "StageTiming",
			benchmarkType: "PipelineInfo",
			stageName: job.stageName,
			duration: job.totalSeconds,
			state: job.state,
			result: job.result,
			buildId: process.env.BUILD_ID ?? "",
			name: process.env.PIPELINE ?? "",
		});
	}
};
