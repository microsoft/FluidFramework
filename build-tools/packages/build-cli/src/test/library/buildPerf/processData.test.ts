/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { describe, it } from "mocha";

import {
	calcDurationMins,
	calcDurationTrend,
	calcPeriodChange,
	calcSummary,
	filterBuilds,
	getBuildUrl,
	getSourceText,
	getSourceUrl,
	parseAdoTime,
	processBuild,
	processRawData,
	processTimelines,
} from "../../../library/buildPerf/processData.js";
import type {
	AdoBuildRecord,
	AdoTimeline,
	DurationTrendPoint,
	ProcessedBuild,
} from "../../../library/buildPerf/types.js";

function makeBuild(overrides: Partial<AdoBuildRecord> = {}): AdoBuildRecord {
	return {
		id: 1000,
		startTime: "2024-06-01T10:00:00Z",
		finishTime: "2024-06-01T11:30:00Z",
		result: "succeeded",
		sourceBranch: "refs/pull/12345/merge",
		sourceVersion: "abc1234567890",
		parameters: JSON.stringify({
			"system.pullRequest.targetBranch": "main",
		}),
		...overrides,
	};
}

function makeProcessedBuild(
	overrides: Partial<ProcessedBuild> = {},
): ProcessedBuild & { duration: number } {
	return {
		id: 1000,
		startTime: "2024-06-01T10:00:00Z",
		result: "succeeded",
		duration: 90,
		source: "PR #12345",
		sourceUrl: "https://github.com/microsoft/FluidFramework/pull/12345",
		url: "https://dev.azure.com/fluidframework/public/_build/results?buildId=1000",
		...overrides,
	} as ProcessedBuild & { duration: number };
}

describe("buildPerf processData", () => {
	describe("parseAdoTime", () => {
		it("returns null for null/undefined input", () => {
			expect(parseAdoTime(null)).to.be.null;
			expect(parseAdoTime(undefined)).to.be.null;
		});

		it("returns null for empty string", () => {
			expect(parseAdoTime("")).to.be.null;
		});

		it("parses a valid ISO timestamp", () => {
			const result = parseAdoTime("2024-06-01T10:30:00Z");
			expect(result).to.be.instanceOf(Date);
			expect(result!.toISOString()).to.equal("2024-06-01T10:30:00.000Z");
		});
	});

	describe("calcDurationMins", () => {
		it("returns null for missing start or finish", () => {
			expect(calcDurationMins(undefined, "2024-06-01T11:00:00Z")).to.be.null;
			expect(calcDurationMins("2024-06-01T10:00:00Z", undefined)).to.be.null;
		});

		it("calculates correct duration in minutes", () => {
			const result = calcDurationMins("2024-06-01T10:00:00Z", "2024-06-01T11:30:00Z");
			expect(result).to.equal(90);
		});

		it("returns 0 for same start and finish", () => {
			const result = calcDurationMins("2024-06-01T10:00:00Z", "2024-06-01T10:00:00Z");
			expect(result).to.equal(0);
		});
	});

	describe("getSourceText", () => {
		it("extracts PR number from refs/pull branch", () => {
			const build = makeBuild({ sourceBranch: "refs/pull/42/merge" });
			expect(getSourceText(build)).to.equal("PR #42");
		});

		it("returns short commit hash when not a PR", () => {
			const build = makeBuild({
				sourceBranch: "refs/heads/main",
				sourceVersion: "abc1234567890",
			});
			expect(getSourceText(build)).to.equal("abc1234");
		});

		it("returns branch name when no commit hash", () => {
			const build = makeBuild({
				sourceBranch: "refs/heads/feature",
				sourceVersion: undefined,
			});
			expect(getSourceText(build)).to.equal("refs/heads/feature");
		});

		it('returns "N/A" for empty branch and no version', () => {
			const build = makeBuild({
				sourceBranch: "",
				sourceVersion: undefined,
			});
			expect(getSourceText(build)).to.equal("N/A");
		});
	});

	describe("getSourceUrl", () => {
		it("returns GitHub PR URL for PR branches", () => {
			const build = makeBuild({ sourceBranch: "refs/pull/42/merge" });
			expect(getSourceUrl(build)).to.equal(
				"https://github.com/microsoft/FluidFramework/pull/42",
			);
		});

		it("returns GitHub commit URL for non-PR branches", () => {
			const build = makeBuild({
				sourceBranch: "refs/heads/main",
				sourceVersion: "abc123",
			});
			expect(getSourceUrl(build)).to.equal(
				"https://github.com/microsoft/FluidFramework/commit/abc123",
			);
		});

		it("returns null when no version and not a PR", () => {
			const build = makeBuild({
				sourceBranch: "refs/heads/main",
				sourceVersion: undefined,
			});
			expect(getSourceUrl(build)).to.be.null;
		});
	});

	describe("getBuildUrl", () => {
		it("generates correct ADO build URL", () => {
			const build = makeBuild({ id: 42 });
			expect(getBuildUrl(build, "public")).to.equal(
				"https://dev.azure.com/fluidframework/public/_build/results?buildId=42",
			);
		});
	});

	describe("filterBuilds", () => {
		it("returns all builds in internal mode", () => {
			const builds = [makeBuild(), makeBuild({ id: 1001 })];
			const result = filterBuilds(builds, "internal");
			expect(result).to.have.length(2);
		});

		it("filters to PR builds targeting main in public mode", () => {
			const mainBuild = makeBuild({
				id: 1,
				parameters: JSON.stringify({
					"system.pullRequest.targetBranch": "main",
				}),
			});
			const devBuild = makeBuild({
				id: 2,
				parameters: JSON.stringify({
					"system.pullRequest.targetBranch": "release/2.0",
				}),
			});
			const result = filterBuilds([mainBuild, devBuild], "public");
			expect(result).to.have.length(1);
			expect(result[0]!.id).to.equal(1);
		});

		it("excludes builds with no parameters in public mode", () => {
			const build = makeBuild({ parameters: undefined });
			const result = filterBuilds([build], "public");
			expect(result).to.have.length(0);
		});

		it("handles invalid JSON in parameters gracefully", () => {
			const build = makeBuild({ parameters: "not-json" });
			const result = filterBuilds([build], "public");
			expect(result).to.have.length(0);
		});
	});

	describe("processBuild", () => {
		it("calculates duration and extracts fields", () => {
			const build = makeBuild({
				id: 42,
				startTime: "2024-06-01T10:00:00Z",
				finishTime: "2024-06-01T11:30:00Z",
			});
			const result = processBuild(build, "public");
			expect(result.id).to.equal(42);
			expect(result.duration).to.equal(90);
			expect(result.source).to.equal("PR #12345");
			expect(result.url).to.include("buildId=42");
		});
	});

	describe("calcSummary", () => {
		it("calculates correct statistics", () => {
			const builds: ProcessedBuild[] = [
				makeProcessedBuild({ id: 1, duration: 60, result: "succeeded" }),
				makeProcessedBuild({ id: 2, duration: 120, result: "succeeded" }),
				makeProcessedBuild({
					id: 3,
					duration: 90,
					result: "partiallySucceeded",
				}),
			];
			const summary = calcSummary(builds);
			expect(summary.totalBuilds).to.equal(3);
			expect(summary.succeeded).to.equal(2);
			expect(summary.successRate).to.be.closeTo(66.67, 0.01);
			expect(summary.avgDuration).to.equal(90);
		});

		it("handles empty builds array", () => {
			const summary = calcSummary([]);
			expect(summary.totalBuilds).to.equal(0);
			expect(summary.avgDuration).to.equal(0);
			expect(summary.successRate).to.equal(0);
		});

		it("handles builds with null duration", () => {
			const builds: ProcessedBuild[] = [
				makeProcessedBuild({ duration: 60 }),
				{ ...makeProcessedBuild(), duration: null },
			];
			const summary = calcSummary(builds);
			expect(summary.totalBuilds).to.equal(2);
			expect(summary.avgDuration).to.equal(60);
		});
	});

	describe("calcPeriodChange", () => {
		it("returns 0 for empty trend", () => {
			expect(calcPeriodChange([], 3)).to.equal(0);
		});

		it("returns 0 when no recent or previous data", () => {
			const trend: DurationTrendPoint[] = [
				{
					date: "2020-01-01",
					minDuration: 80,
					avgDuration: 90,
					maxDuration: 100,
					minBuildId: 1,
					maxBuildId: 2,
				},
			];
			// All data is in the past, nothing is "recent"
			expect(calcPeriodChange(trend, 3)).to.equal(0);
		});

		it("calculates positive change correctly", () => {
			const now = new Date();
			const yesterday = new Date(now);
			yesterday.setDate(yesterday.getDate() - 1);
			const lastWeek = new Date(now);
			lastWeek.setDate(lastWeek.getDate() - 10);

			const trend: DurationTrendPoint[] = [
				{
					date: lastWeek.toISOString().split("T")[0]!,
					minDuration: 80,
					avgDuration: 100,
					maxDuration: 120,
					minBuildId: 1,
					maxBuildId: 2,
				},
				{
					date: yesterday.toISOString().split("T")[0]!,
					minDuration: 100,
					avgDuration: 120,
					maxDuration: 140,
					minBuildId: 3,
					maxBuildId: 4,
				},
			];
			const change = calcPeriodChange(trend, 3);
			// 120 vs 100 = 20% increase
			expect(change).to.equal(20);
		});
	});

	describe("calcDurationTrend", () => {
		it("groups builds by date and calculates min/avg/max", () => {
			const builds: ProcessedBuild[] = [
				makeProcessedBuild({
					id: 1,
					startTime: "2024-06-01T10:00:00Z",
					duration: 60,
				}),
				makeProcessedBuild({
					id: 2,
					startTime: "2024-06-01T14:00:00Z",
					duration: 120,
				}),
				makeProcessedBuild({
					id: 3,
					startTime: "2024-06-02T10:00:00Z",
					duration: 90,
				}),
			];
			const trend = calcDurationTrend(builds);
			expect(trend).to.have.length(2);

			const day1 = trend[0]!;
			expect(day1.date).to.equal("2024-06-01");
			expect(day1.minDuration).to.equal(60);
			expect(day1.avgDuration).to.equal(90);
			expect(day1.maxDuration).to.equal(120);
			expect(day1.minBuildId).to.equal(1);
			expect(day1.maxBuildId).to.equal(2);
		});

		it("sorts results by date", () => {
			const builds: ProcessedBuild[] = [
				makeProcessedBuild({
					id: 1,
					startTime: "2024-06-03T10:00:00Z",
					duration: 60,
				}),
				makeProcessedBuild({
					id: 2,
					startTime: "2024-06-01T10:00:00Z",
					duration: 90,
				}),
			];
			const trend = calcDurationTrend(builds);
			expect(trend[0]!.date).to.equal("2024-06-01");
			expect(trend[1]!.date).to.equal("2024-06-03");
		});
	});

	describe("processTimelines", () => {
		it("extracts stage and task metrics", () => {
			const timelines: Record<string, AdoTimeline> = {
				"1": {
					records: [
						{
							id: "stage1",
							type: "Stage",
							name: "Build",
							startTime: "2024-06-01T10:00:00Z",
							finishTime: "2024-06-01T10:30:00Z",
						},
						{
							id: "task1",
							parentId: "stage1",
							type: "Phase",
							name: "Compile",
							startTime: "2024-06-01T10:00:00Z",
							finishTime: "2024-06-01T10:20:00Z",
						},
					],
				},
			};
			const { stagePerformance, stageTaskBreakdown } = processTimelines(timelines);

			expect(stagePerformance).to.have.length(1);
			expect(stagePerformance[0]!.name).to.equal("Build");
			expect(stagePerformance[0]!.avgDuration).to.equal(30);

			const buildTasks = stageTaskBreakdown["Build"]!;
			expect(buildTasks).to.have.length(1);
			expect(buildTasks[0]!.name).to.equal("Compile");
			expect(buildTasks[0]!.avgDuration).to.equal(20);
		});

		it("handles empty timelines", () => {
			const { stagePerformance, stageTaskBreakdown } = processTimelines({});
			expect(stagePerformance).to.have.length(0);
			expect(Object.keys(stageTaskBreakdown)).to.have.length(0);
		});

		it("averages across multiple timelines", () => {
			const timelines: Record<string, AdoTimeline> = {
				"1": {
					records: [
						{
							id: "s1",
							type: "Stage",
							name: "Build",
							startTime: "2024-06-01T10:00:00Z",
							finishTime: "2024-06-01T10:30:00Z",
						},
					],
				},
				"2": {
					records: [
						{
							id: "s1",
							type: "Stage",
							name: "Build",
							startTime: "2024-06-02T10:00:00Z",
							finishTime: "2024-06-02T11:00:00Z",
						},
					],
				},
			};
			const { stagePerformance } = processTimelines(timelines);
			expect(stagePerformance).to.have.length(1);
			// Average of 30 and 60 = 45
			expect(stagePerformance[0]!.avgDuration).to.equal(45);
		});
	});

	describe("processRawData", () => {
		it("produces complete output for public mode", () => {
			const builds = [
				makeBuild({
					id: 1,
					startTime: "2024-06-01T10:00:00Z",
					finishTime: "2024-06-01T11:30:00Z",
					result: "succeeded",
				}),
			];
			const timelines: Record<string, AdoTimeline> = {
				"1": {
					records: [
						{
							id: "s1",
							type: "Stage",
							name: "Build",
							startTime: "2024-06-01T10:00:00Z",
							finishTime: "2024-06-01T11:00:00Z",
						},
					],
				},
			};

			const result = processRawData(builds, timelines, "public", "2024-06-01T12:00:00Z");

			expect(result.generatedAt).to.equal("2024-06-01T12:00:00Z");
			expect(result.summary.totalBuilds).to.equal(1);
			expect(result.summary.succeeded).to.equal(1);
			expect(result.summary.avgDuration).to.equal(90);
			expect(result.durationTrend).to.have.length(1);
			expect(result.recentBuilds).to.have.length(1);
			expect(result.longestBuilds).to.have.length(1);
			expect(result.stagePerformance).to.have.length(1);
			expect(result.stageDurationTrend.stageNames).to.include("Build");
		});

		it("filters builds in public mode", () => {
			const mainPR = makeBuild({
				id: 1,
				parameters: JSON.stringify({
					"system.pullRequest.targetBranch": "main",
				}),
			});
			const releasePR = makeBuild({
				id: 2,
				parameters: JSON.stringify({
					"system.pullRequest.targetBranch": "release/2.0",
				}),
			});

			const result = processRawData([mainPR, releasePR], {}, "public");
			expect(result.summary.totalBuilds).to.equal(1);
		});

		it("does not filter in internal mode", () => {
			const builds = [
				makeBuild({ id: 1 }),
				makeBuild({
					id: 2,
					parameters: JSON.stringify({
						"system.pullRequest.targetBranch": "release/2.0",
					}),
				}),
			];

			const result = processRawData(builds, {}, "internal");
			expect(result.summary.totalBuilds).to.equal(2);
		});
	});
});
