/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	AdoClientLogger,
	FetchBuildsOptions,
	FetchTimelinesOptions,
} from "./adoClient.js";
export { fetchBuilds, fetchTimelines } from "./adoClient.js";
export { BUILD_PERF_CONFIG } from "./config.js";
export { generateStandaloneHtml, TEMPLATES_DIR } from "./htmlGenerator.js";
export {
	calcDurationMins,
	calcDurationTrend,
	calcPeriodChange,
	calcStageDurationTrend,
	calcSummary,
	calcTaskDurationTrend,
	filterBuilds,
	getBuildUrl,
	getSourceText,
	getSourceUrl,
	parseAdoTime,
	processBuild,
	processRawData,
	processTimelines,
} from "./processData.js";
export type {
	AdoBuildRecord,
	AdoTimeline,
	AdoTimelineRecord,
	BuildPerfMode,
	BuildSummary,
	DurationTrendPoint,
	ProcessedBuild,
	ProcessedDataOutput,
	StageDurationTrend,
	StagePerformance,
	TaskDurationTrend,
	ThresholdResult,
} from "./types.js";
