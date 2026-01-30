/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Pre-processes raw ADO build and timeline data into aggregated dashboard metrics.
 * This runs during the pipeline to reduce payload size from ~300MB to ~50KB.
 *
 * Usage: node process-data.cjs <input-raw.json> <output-processed.json> <mode>
 *   mode: "public" or "internal"
 */

const fs = require("fs");

// Configuration
const config = {
	githubRepo: "microsoft/FluidFramework",
	org: "fluidframework",
};

// Parse ADO timestamp to Date object
function parseAdoTime(timestamp) {
	if (!timestamp) return null;
	return new Date(timestamp);
}

// Calculate duration in minutes between two timestamps
function calcDurationMins(startTime, finishTime) {
	const start = parseAdoTime(startTime);
	const finish = parseAdoTime(finishTime);
	if (!start || !finish) return null;
	return (finish - start) / (1000 * 60);
}

// Extract source display text from build
function getSourceText(build) {
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

// Build source URL (GitHub PR or commit)
function getSourceUrl(build) {
	const branch = build.sourceBranch || "";
	if (branch.startsWith("refs/pull/")) {
		const prNum = branch.split("/")[2];
		return prNum ? `https://github.com/${config.githubRepo}/pull/${prNum}` : null;
	}
	if (build.sourceVersion) {
		return `https://github.com/${config.githubRepo}/commit/${build.sourceVersion}`;
	}
	return null;
}

// Build ADO build URL
function getBuildUrl(build, project) {
	return `https://dev.azure.com/${config.org}/${project}/_build/results?buildId=${build.id}`;
}

// Filter builds for public mode (PR builds targeting main)
function filterBuilds(builds, mode) {
	if (mode !== "public") return builds;
	return builds.filter((build) => {
		if (!build.parameters) return false;
		try {
			const params = JSON.parse(build.parameters);
			return params["system.pullRequest.targetBranch"] === "main";
		} catch {
			return false;
		}
	});
}

// Process raw build data into display format
function processBuild(build, project) {
	const duration = calcDurationMins(build.startTime, build.finishTime);
	return {
		id: build.id,
		startTime: build.startTime,
		result: build.result,
		duration: duration,
		source: getSourceText(build),
		sourceUrl: getSourceUrl(build),
		url: getBuildUrl(build, project),
	};
}

// Calculate summary statistics
function calcSummary(builds) {
	const validBuilds = builds.filter((b) => b.duration !== null);
	const succeeded = builds.filter((b) => b.result === "succeeded").length;
	const totalDuration = validBuilds.reduce((sum, b) => sum + b.duration, 0);
	return {
		totalBuilds: builds.length,
		succeeded: succeeded,
		successRate: builds.length > 0 ? (succeeded * 100) / builds.length : 0,
		avgDuration: validBuilds.length > 0 ? totalDuration / validBuilds.length : 0,
	};
}

// Calculate duration trend (min, average, max per day)
function calcDurationTrend(builds) {
	const validBuilds = builds.filter((b) => b.startTime && b.duration !== null);
	const byDate = {};
	validBuilds.forEach((b) => {
		const date = b.startTime.split("T")[0];
		if (!byDate[date]) byDate[date] = [];
		byDate[date].push({ duration: b.duration, id: b.id });
	});
	return Object.entries(byDate)
		.map(([date, buildInfos]) => {
			const durations = buildInfos.map((b) => b.duration);
			const minDuration = Math.min(...durations);
			const maxDuration = Math.max(...durations);
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

// Process timeline data to extract stage metrics
function processTimelines(timelines) {
	const stageData = {};
	const stageTasksData = {};

	Object.values(timelines || {}).forEach((timeline) => {
		if (!timeline || !timeline.records) return;

		const stages = timeline.records.filter(
			(r) => r.type === "Stage" && r.startTime && r.finishTime,
		);

		stages.forEach((stage) => {
			const duration = calcDurationMins(stage.startTime, stage.finishTime);
			if (duration === null) return;

			if (!stageData[stage.name]) stageData[stage.name] = [];
			stageData[stage.name].push(duration);

			// Find tasks (phases) for this stage
			const tasks = timeline.records.filter(
				(r) => r.type === "Phase" && r.parentId === stage.id && r.startTime && r.finishTime,
			);

			if (!stageTasksData[stage.name]) stageTasksData[stage.name] = {};
			tasks.forEach((task) => {
				const taskDuration = calcDurationMins(task.startTime, task.finishTime);
				if (taskDuration === null) return;
				if (!stageTasksData[stage.name][task.name]) stageTasksData[stage.name][task.name] = [];
				stageTasksData[stage.name][task.name].push(taskDuration);
			});
		});
	});

	// Calculate averages
	const stagePerformance = Object.entries(stageData).map(([name, durations]) => ({
		name,
		avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
	}));

	const stageTaskBreakdown = {};
	Object.entries(stageTasksData).forEach(([stageName, tasks]) => {
		stageTaskBreakdown[stageName] = Object.entries(tasks).map(([taskName, durations]) => ({
			name: taskName,
			avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
		}));
	});

	return { stagePerformance, stageTaskBreakdown };
}

// Calculate stage duration trend over time (for stacked bar chart)
function calcStageDurationTrend(builds, timelines) {
	const byDate = {};

	builds.forEach((build) => {
		if (!build.startTime || !build.id) return;
		const date = build.startTime.split("T")[0];
		const timeline = timelines[build.id];
		if (!timeline || !timeline.records) return;

		const stages = timeline.records.filter(
			(r) => r.type === "Stage" && r.startTime && r.finishTime,
		);

		if (!byDate[date]) byDate[date] = { stages: {}, buildCount: 0, buildIds: [] };
		byDate[date].buildCount++;
		byDate[date].buildIds.push(build.id);

		stages.forEach((stage) => {
			const duration = calcDurationMins(stage.startTime, stage.finishTime);
			if (duration === null) return;
			if (!byDate[date].stages[stage.name]) byDate[date].stages[stage.name] = [];
			byDate[date].stages[stage.name].push(duration);
		});
	});

	// Calculate average duration per stage per date, filter out days with no stage data
	const dates = Object.keys(byDate)
		.sort()
		.filter((date) => Object.keys(byDate[date].stages).length > 0);
	const allStages = new Set();
	dates.forEach((date) => {
		Object.keys(byDate[date].stages).forEach((stage) => allStages.add(stage));
	});

	const stageNames = Array.from(allStages).sort();
	const trendData = dates.map((date) => {
		const entry = { date, buildCount: byDate[date].buildCount, buildIds: byDate[date].buildIds };
		stageNames.forEach((stage) => {
			const durations = byDate[date].stages[stage] || [];
			entry[stage] =
				durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
		});
		return entry;
	});

	return { trendData, stageNames };
}

// Calculate task duration trend over time (for stacked bar chart)
function calcTaskDurationTrend(builds, timelines) {
	const byDate = {};

	builds.forEach((build) => {
		if (!build.startTime || !build.id) return;
		const date = build.startTime.split("T")[0];
		const timeline = timelines[build.id];
		if (!timeline || !timeline.records) return;

		const stages = timeline.records.filter((r) => r.type === "Stage" && r.id);
		const stageIdMap = {};
		stages.forEach((s) => {
			stageIdMap[s.id] = s.name;
		});

		// Find tasks (phases) within stages
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

		tasks.forEach((task) => {
			const duration = calcDurationMins(task.startTime, task.finishTime);
			if (duration === null) return;
			const taskKey = stageIdMap[task.parentId] + " › " + task.name;
			if (!byDate[date].tasks[taskKey]) byDate[date].tasks[taskKey] = [];
			byDate[date].tasks[taskKey].push(duration);
		});
	});

	// Calculate average duration per task per date, filter out days with no task data
	const dates = Object.keys(byDate)
		.sort()
		.filter((date) => Object.keys(byDate[date].tasks).length > 0);
	const allTasks = new Set();
	dates.forEach((date) => {
		Object.keys(byDate[date].tasks).forEach((task) => allTasks.add(task));
	});

	// Sort tasks by overall average duration (descending) and take top 10
	const taskAvgs = {};
	Array.from(allTasks).forEach((task) => {
		let total = 0,
			count = 0;
		dates.forEach((date) => {
			const durations = byDate[date].tasks[task] || [];
			durations.forEach((d) => {
				total += d;
				count++;
			});
		});
		taskAvgs[task] = count > 0 ? total / count : 0;
	});
	const taskNames = Array.from(allTasks)
		.sort((a, b) => taskAvgs[b] - taskAvgs[a])
		.slice(0, 10);

	const trendData = dates.map((date) => {
		const entry = { date, buildCount: byDate[date].buildCount, buildIds: byDate[date].buildIds };
		taskNames.forEach((task) => {
			const durations = byDate[date].tasks[task] || [];
			entry[task] =
				durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
		});
		return entry;
	});

	return { trendData, taskNames };
}

// Main processing function
function processRawData(rawData, mode) {
	const project = mode === "public" ? "public" : "internal";

	// Filter and process builds
	const filteredBuilds = filterBuilds(rawData.builds || [], mode);
	const processedBuilds = filteredBuilds
		.map((b) => processBuild(b, project))
		.filter((b) => b.duration !== null);

	// Process timeline data
	const { stagePerformance, stageTaskBreakdown } = processTimelines(rawData.timelines);
	const stageDurationTrend = calcStageDurationTrend(filteredBuilds, rawData.timelines || {});
	const taskDurationTrend = calcTaskDurationTrend(filteredBuilds, rawData.timelines || {});

	// Sort for recent and longest builds
	const sortedByDate = [...processedBuilds].sort(
		(a, b) => new Date(b.startTime) - new Date(a.startTime),
	);
	const sortedByDuration = [...processedBuilds].sort((a, b) => b.duration - a.duration);

	return {
		generatedAt: rawData.generatedAt,
		summary: calcSummary(processedBuilds),
		durationTrend: calcDurationTrend(processedBuilds),
		recentBuilds: sortedByDate.slice(0, 20),
		longestBuilds: sortedByDuration.slice(0, 20),
		stagePerformance,
		stageTaskBreakdown,
		stageDurationTrend,
		taskDurationTrend,
	};
}

// CLI entry point
function main() {
	const args = process.argv.slice(2);
	if (args.length < 3) {
		console.error(
			"Usage: node process-data.cjs <input-raw.json> <output-processed.json> <mode>",
		);
		console.error("  mode: 'public' or 'internal'");
		process.exit(1);
	}

	const [inputFile, outputFile, mode] = args;

	if (mode !== "public" && mode !== "internal") {
		console.error("Error: mode must be 'public' or 'internal'");
		process.exit(1);
	}

	const rawData = JSON.parse(fs.readFileSync(inputFile, "utf8"));
	const processedData = processRawData(rawData, mode);
	const output = JSON.stringify(processedData);
	fs.writeFileSync(outputFile, output);
}

main();
