/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The mode in which the build-perf pipeline operates.
 */
export type BuildPerfMode = "public" | "internal";

/**
 * A raw ADO build record (subset of fields we use).
 */
export interface AdoBuildRecord {
	id: number;
	startTime: string;
	finishTime: string;
	result: string;
	sourceBranch: string;
	sourceVersion?: string;
	parameters?: string;
}

/**
 * A single ADO build timeline record (one task).
 */
export interface AdoTimelineRecord {
	id: string;
	parentId?: string;
	type: string;
	name: string;
	startTime?: string;
	finishTime?: string;
}

/**
 * All ADO build timeline records for a single build.
 */
export interface AdoTimeline {
	records: AdoTimelineRecord[];
}

/**
 * A processed build (output format for the dashboard).
 */
export interface ProcessedBuild {
	id: number;
	startTime: string;
	result: string;
	duration: number | null;
	source: string;
	sourceUrl: string | null;
	url: string;
}

/**
 * Duration trend data point (per-day aggregation).
 */
export interface DurationTrendPoint {
	date: string;
	minDuration: number;
	avgDuration: number;
	maxDuration: number;
	minBuildId: number | null;
	maxBuildId: number | null;
}

/**
 * Stage performance data.
 */
export interface StagePerformance {
	name: string;
	avgDuration: number;
}

/**
 * Stage duration trend data for stacked bar charts.
 */
export interface StageDurationTrend {
	trendData: Record<string, unknown>[];
	stageNames: string[];
}

/**
 * Task duration trend data for stacked bar charts.
 */
export interface TaskDurationTrend {
	trendData: Record<string, unknown>[];
	taskNames: string[];
}

/**
 * Build summary statistics.
 */
export interface BuildSummary {
	totalBuilds: number;
	succeeded: number;
	successRate: number;
	avgDuration: number;
}

/**
 * The final processed data output written to {mode}-data.json.
 */
export interface ProcessedDataOutput {
	generatedAt: string;
	summary: BuildSummary;
	durationTrend: DurationTrendPoint[];
	change3Day: number;
	change7Day: number;
	recentBuilds: ProcessedBuild[];
	longestBuilds: ProcessedBuild[];
	stagePerformance: StagePerformance[];
	stageTaskBreakdown: Record<string, StagePerformance[]>;
	stageDurationTrend: StageDurationTrend;
	taskDurationTrend: TaskDurationTrend;
}

/**
 * Threshold check result.
 */
export interface ThresholdResult {
	passed: boolean;
	alertReasons: string[];
	avgDuration: number;
	changePeriod: number;
}
