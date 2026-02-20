/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Processes raw ADO build data into aggregated metrics for build performance dashboards.
 */

import { BUILD_PERF_CONFIG } from "./config.js";
import type {
	AdoBuildRecord,
	AdoTimeline,
	BuildPerfMode,
	BuildSummary,
	DurationTrendPoint,
	ProcessedBuild,
	ProcessedDataOutput,
	StageDurationTrend,
	StagePerformance,
	TaskDurationTrend,
} from "./types.js";

/**
 * Parse an ADO timestamp string into a Date object.
 */
export function parseAdoTime(timestamp: string | undefined | null): Date | null {
	if (!timestamp) return null;
	const date = new Date(timestamp);
	if (isNaN(date.getTime())) return null;
	return date;
}

/**
 * Calculate duration in minutes between two timestamps.
 */
export function calcDurationMins(
	startTime: string | undefined,
	finishTime: string | undefined,
): number | null {
	const start = parseAdoTime(startTime);
	const finish = parseAdoTime(finishTime);
	if (!start || !finish) return null;
	return (finish.getTime() - start.getTime()) / (1000 * 60);
}

/**
 * Extract source display text from a build record.
 * Returns PR number for PR builds, short commit hash otherwise.
 */
export function getSourceText(build: AdoBuildRecord): string {
	const branch = build.sourceBranch || "";
	if (branch.startsWith("refs/pull/")) {
		const prNum = branch.split("/")[2];
		return prNum ? `PR #${prNum}` : "N/A";
	}
	if (build.sourceVersion) {
		return build.sourceVersion.substring(0, 7);
	}
	return branch.substring(0, 30) || "N/A";
}

/**
 * Build source URL (GitHub PR or commit).
 *
 * @param build - The build record.
 * @param githubRepo - GitHub repo slug (e.g. "microsoft/FluidFramework"). Defaults to BUILD_PERF_CONFIG.githubRepo.
 */
export function getSourceUrl(
	build: AdoBuildRecord,
	githubRepo: string = BUILD_PERF_CONFIG.githubRepo,
): string | null {
	const branch = build.sourceBranch || "";
	if (branch.startsWith("refs/pull/")) {
		const prNum = branch.split("/")[2];
		return prNum ? `https://github.com/${githubRepo}/pull/${prNum}` : null;
	}
	if (build.sourceVersion) {
		return `https://github.com/${githubRepo}/commit/${build.sourceVersion}`;
	}
	return null;
}

/**
 * Build ADO build URL.
 *
 * @param build - The build record.
 * @param project - The ADO project name.
 * @param org - The ADO organization name. Defaults to BUILD_PERF_CONFIG.org.
 */
export function getBuildUrl(
	build: AdoBuildRecord,
	project: string,
	org: string = BUILD_PERF_CONFIG.org,
): string {
	return `https://dev.azure.com/${org}/${project}/_build/results?buildId=${build.id}`;
}

/**
 * Filter builds for public mode (PR builds targeting main).
 * Internal mode returns all builds (they are already filtered by the query).
 */
export function filterBuilds(builds: AdoBuildRecord[], mode: BuildPerfMode): AdoBuildRecord[] {
	if (mode !== "public") return builds;
	return builds.filter((build) => {
		if (!build.parameters) return false;
		try {
			const params = JSON.parse(build.parameters) as Record<string, string>;
			return params["system.pullRequest.targetBranch"] === "main";
		} catch {
			return false;
		}
	});
}

/**
 * Process a raw build record into the display format.
 */
export function processBuild(
	build: AdoBuildRecord,
	project: string,
	org?: string,
	githubRepo?: string,
): ProcessedBuild {
	const duration = calcDurationMins(build.startTime, build.finishTime);
	return {
		id: build.id,
		startTime: build.startTime,
		result: build.result,
		duration,
		source: getSourceText(build),
		sourceUrl: getSourceUrl(build, githubRepo),
		url: getBuildUrl(build, project, org),
	};
}

/**
 * Calculate summary statistics from processed builds.
 */
export function calcSummary(builds: ProcessedBuild[]): BuildSummary {
	const validBuilds = builds.filter((b) => b.duration !== null);
	const succeeded = builds.filter((b) => b.result === "succeeded").length;
	const totalDuration = validBuilds.reduce((sum, b) => sum + (b.duration ?? 0), 0);
	return {
		totalBuilds: builds.length,
		succeeded,
		successRate: builds.length > 0 ? (succeeded * 100) / builds.length : 0,
		avgDuration: validBuilds.length > 0 ? totalDuration / validBuilds.length : 0,
	};
}

/**
 * Calculate percentage change over a period using calendar days.
 * Compares the average duration of the last N calendar days vs the previous period.
 */
export function calcPeriodChange(durationTrend: DurationTrendPoint[], days: number): number {
	if (!durationTrend || durationTrend.length === 0) return 0;

	// Derive cutoff from the latest date in the data, not the system clock.
	// This makes the calculation deterministic and resilient to pipeline delays.
	const latestDate = durationTrend.reduce(
		(max, d) => (d.date > max ? d.date : max),
		durationTrend[0].date,
	);
	const cutoffDate = new Date(latestDate);
	cutoffDate.setDate(cutoffDate.getDate() - days);
	const cutoffDateStr = cutoffDate.toISOString().split("T")[0];

	const recentBuilds = durationTrend.filter((d) => d.date >= cutoffDateStr);
	const previousBuilds = durationTrend.filter((d) => d.date < cutoffDateStr);

	if (recentBuilds.length === 0 || previousBuilds.length === 0) return 0;

	const recentAvg =
		recentBuilds.reduce((sum, d) => sum + d.avgDuration, 0) / recentBuilds.length;
	const previousAvg =
		previousBuilds.reduce((sum, d) => sum + d.avgDuration, 0) / previousBuilds.length;

	if (previousAvg === 0) return 0;

	return ((recentAvg - previousAvg) / previousAvg) * 100;
}

/**
 * Calculate duration trend (min, average, max per day).
 */
export function calcDurationTrend(builds: ProcessedBuild[]): DurationTrendPoint[] {
	const validBuilds = builds.filter(
		(b) => b.startTime && b.duration !== null,
	) as (ProcessedBuild & { duration: number })[];
	const byDate: Record<string, { duration: number; id: number }[]> = {};
	for (const b of validBuilds) {
		const date = b.startTime.split("T")[0];
		if (!byDate[date]) byDate[date] = [];
		byDate[date].push({ duration: b.duration, id: b.id });
	}
	return Object.entries(byDate)
		.map(([date, buildInfos]) => {
			const durations = buildInfos.map((b) => b.duration);
			const minDuration = durations.reduce((a, b) => Math.min(a, b), Infinity);
			const maxDuration = durations.reduce((a, b) => Math.max(a, b), -Infinity);
			const minBuild = buildInfos.find((b) => b.duration === minDuration);
			const maxBuild = buildInfos.find((b) => b.duration === maxDuration);
			return {
				date,
				minDuration,
				avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
				maxDuration,
				minBuildId: minBuild ? minBuild.id : null,
				maxBuildId: maxBuild ? maxBuild.id : null,
			};
		})
		.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Process timeline data to extract stage and task metrics.
 */
export function processTimelines(timelines: Record<string, AdoTimeline>): {
	stagePerformance: StagePerformance[];
	stageTaskBreakdown: Record<string, StagePerformance[]>;
} {
	const stageData: Record<string, number[]> = {};
	const stageTasksData: Record<string, Record<string, number[]>> = {};

	for (const timeline of Object.values(timelines)) {
		if (!timeline?.records) continue;

		const stages = timeline.records.filter(
			(r) => r.type === "Stage" && r.startTime && r.finishTime,
		);

		for (const stage of stages) {
			const duration = calcDurationMins(stage.startTime, stage.finishTime);
			if (duration === null) continue;

			if (!stageData[stage.name]) stageData[stage.name] = [];
			stageData[stage.name].push(duration);

			const tasks = timeline.records.filter(
				(r) => r.type === "Phase" && r.parentId === stage.id && r.startTime && r.finishTime,
			);

			if (!stageTasksData[stage.name]) stageTasksData[stage.name] = {};
			for (const task of tasks) {
				const taskDuration = calcDurationMins(task.startTime, task.finishTime);
				if (taskDuration === null) continue;
				if (!stageTasksData[stage.name][task.name]) stageTasksData[stage.name][task.name] = [];
				stageTasksData[stage.name][task.name].push(taskDuration);
			}
		}
	}

	const stagePerformance = Object.entries(stageData).map(([name, durations]) => ({
		name,
		avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
	}));

	const stageTaskBreakdown: Record<string, StagePerformance[]> = {};
	for (const [stageName, tasks] of Object.entries(stageTasksData)) {
		stageTaskBreakdown[stageName] = Object.entries(tasks).map(([taskName, durations]) => ({
			name: taskName,
			avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
		}));
	}

	return { stagePerformance, stageTaskBreakdown };
}

/**
 * Keys reserved for metadata in trend data entries.
 * Any stage/task names matching these are excluded to prevent data corruption.
 */
const RESERVED_TREND_KEYS = new Set(["date", "buildCount", "buildIds"]);

/**
 * Calculate stage duration trend over time (for stacked bar chart).
 */
export function calcStageDurationTrend(
	builds: AdoBuildRecord[],
	timelines: Record<string, AdoTimeline>,
): StageDurationTrend {
	const byDate: Record<
		string,
		{ stages: Record<string, number[]>; buildCount: number; buildIds: number[] }
	> = {};

	for (const build of builds) {
		if (!build.startTime || !build.id) continue;
		const date = build.startTime.split("T")[0];
		const timeline = timelines[build.id];
		if (!timeline?.records) continue;

		const stages = timeline.records.filter(
			(r) => r.type === "Stage" && r.startTime && r.finishTime,
		);

		if (!byDate[date]) byDate[date] = { stages: {}, buildCount: 0, buildIds: [] };
		byDate[date].buildCount++;
		byDate[date].buildIds.push(build.id);

		for (const stage of stages) {
			const duration = calcDurationMins(stage.startTime, stage.finishTime);
			if (duration === null) continue;
			if (!byDate[date].stages[stage.name]) byDate[date].stages[stage.name] = [];
			byDate[date].stages[stage.name].push(duration);
		}
	}

	const dates = Object.keys(byDate)
		.sort()
		.filter((date) => Object.keys(byDate[date].stages).length > 0);
	const allStages = new Set<string>();
	for (const date of dates) {
		for (const stage of Object.keys(byDate[date].stages)) {
			allStages.add(stage);
		}
	}

	const stageNames = [...allStages].filter((name) => !RESERVED_TREND_KEYS.has(name)).sort();
	const trendData = dates.map((date) => {
		const entry: Record<string, unknown> = {
			date,
			buildCount: byDate[date].buildCount,
			buildIds: byDate[date].buildIds,
		};
		for (const stage of stageNames) {
			const durations = byDate[date].stages[stage] || [];
			entry[stage] =
				durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
		}
		return entry;
	});

	return { trendData, stageNames };
}

/**
 * Calculate task duration trend over time (for stacked bar chart).
 * Returns top 10 tasks by average duration.
 */
export function calcTaskDurationTrend(
	builds: AdoBuildRecord[],
	timelines: Record<string, AdoTimeline>,
): TaskDurationTrend {
	const byDate: Record<
		string,
		{ tasks: Record<string, number[]>; buildCount: number; buildIds: number[] }
	> = {};

	for (const build of builds) {
		if (!build.startTime || !build.id) continue;
		const date = build.startTime.split("T")[0];
		const timeline = timelines[build.id];
		if (!timeline?.records) continue;

		const stages = timeline.records.filter((r) => r.type === "Stage" && r.id);
		const stageIdMap: Record<string, string> = {};
		for (const s of stages) {
			stageIdMap[s.id] = s.name;
		}

		const tasks = timeline.records.filter(
			(r) =>
				r.type === "Phase" &&
				r.parentId &&
				stageIdMap[r.parentId] &&
				r.startTime &&
				r.finishTime,
		);

		if (!byDate[date]) byDate[date] = { tasks: {}, buildCount: 0, buildIds: [] };
		byDate[date].buildCount++;
		byDate[date].buildIds.push(build.id);

		for (const task of tasks) {
			const duration = calcDurationMins(task.startTime, task.finishTime);
			if (duration === null) continue;
			const taskKey = `${stageIdMap[task.parentId!]} \u203A ${task.name}`;
			if (!byDate[date].tasks[taskKey]) byDate[date].tasks[taskKey] = [];
			byDate[date].tasks[taskKey].push(duration);
		}
	}

	const dates = Object.keys(byDate)
		.sort()
		.filter((date) => Object.keys(byDate[date].tasks).length > 0);
	const allTasks = new Set<string>();
	for (const date of dates) {
		for (const task of Object.keys(byDate[date].tasks)) {
			allTasks.add(task);
		}
	}

	// Sort tasks by overall average duration (descending) and take top 10
	const taskAvgs: Record<string, number> = {};
	for (const task of allTasks) {
		let total = 0;
		let count = 0;
		for (const date of dates) {
			const durations = byDate[date].tasks[task] || [];
			for (const d of durations) {
				total += d;
				count++;
			}
		}
		taskAvgs[task] = count > 0 ? total / count : 0;
	}
	const taskNames = [...allTasks]
		.filter((name) => !RESERVED_TREND_KEYS.has(name))
		.sort((a, b) => taskAvgs[b] - taskAvgs[a])
		.slice(0, 10);

	const trendData = dates.map((date) => {
		const entry: Record<string, unknown> = {
			date,
			buildCount: byDate[date].buildCount,
			buildIds: byDate[date].buildIds,
		};
		for (const task of taskNames) {
			const durations = byDate[date].tasks[task] || [];
			entry[task] =
				durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
		}
		return entry;
	});

	return { trendData, taskNames };
}

/**
 * Main processing function. Transforms raw ADO build and timeline data
 * into aggregated dashboard metrics.
 */
export function processRawData(
	builds: AdoBuildRecord[],
	timelines: Record<string, AdoTimeline>,
	mode: BuildPerfMode,
	generatedAt?: string,
	org?: string,
	githubRepo?: string,
): ProcessedDataOutput {
	const project = mode === "public" ? "public" : "internal";

	const filteredBuilds = filterBuilds(builds, mode);
	const processedBuilds = filteredBuilds
		.map((b) => processBuild(b, project, org, githubRepo))
		.filter((b): b is ProcessedBuild & { duration: number } => b.duration !== null);

	const { stagePerformance, stageTaskBreakdown } = processTimelines(timelines);
	const stageDurationTrend = calcStageDurationTrend(filteredBuilds, timelines);
	const taskDurationTrend = calcTaskDurationTrend(filteredBuilds, timelines);

	const sortedByDate = [...processedBuilds].sort(
		(a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
	);
	const sortedByDuration = [...processedBuilds].sort((a, b) => b.duration - a.duration);

	const durationTrend = calcDurationTrend(processedBuilds);
	const change3Day = calcPeriodChange(durationTrend, 3);
	const change7Day = calcPeriodChange(durationTrend, 7);

	return {
		generatedAt: generatedAt ?? new Date().toISOString(),
		summary: calcSummary(processedBuilds),
		durationTrend,
		change3Day,
		change7Day,
		recentBuilds: sortedByDate.slice(0, 20),
		longestBuilds: sortedByDuration.slice(0, 20),
		stagePerformance,
		stageTaskBreakdown,
		stageDurationTrend,
		taskDurationTrend,
	};
}
