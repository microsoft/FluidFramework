/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { writeFile } from "node:fs/promises";

import chalk from "picocolors";

import { defaultLogger } from "../common/logging";

const { log } = defaultLogger;

export enum TaskCacheOutcome {
	CacheHitInitial = "cacheHitInitial",
	CacheHitRecheck = "cacheHitRecheck",
	CacheMiss = "cacheMiss",
	NonIncremental = "nonIncremental",
	Failed = "failed",
	NotRun = "notRun",
}

export interface TaskMetricRecord {
	taskName: string;
	packageName: string;
	command: string;
	executable: string;
	outcome: TaskCacheOutcome;
	isIncremental: boolean;
	supportsRecheck: boolean;
	execTimeSeconds: number;
	queueWaitSeconds: number;
	worker: boolean;
}

interface ExecutableBreakdown {
	executable: string;
	total: number;
	cached: number;
	miss: number;
	nonIncremental: number;
	failed: number;
	totalExecTimeSeconds: number;
}

export interface BuildMetricsSummary {
	totalTasks: number;
	cacheHitInitial: number;
	cacheHitRecheck: number;
	cacheMiss: number;
	nonIncremental: number;
	failed: number;
	notRun: number;
	cacheHitRate: number;
	cacheableHitRate: number;
	byExecutable: ExecutableBreakdown[];
}

export interface BuildMetricsJson {
	timestamp: string;
	summary: BuildMetricsSummary;
	tasks: TaskMetricRecord[];
}

export class BuildMetrics {
	private readonly records: TaskMetricRecord[] = [];

	public recordTask(record: TaskMetricRecord): void {
		this.records.push(record);
	}

	public getSummary(): BuildMetricsSummary {
		let cacheHitInitial = 0;
		let cacheHitRecheck = 0;
		let cacheMiss = 0;
		let nonIncremental = 0;
		let failed = 0;
		let notRun = 0;

		const byExec = new Map<string, ExecutableBreakdown>();

		for (const r of this.records) {
			const eb = byExec.get(r.executable) ?? {
				executable: r.executable,
				total: 0,
				cached: 0,
				miss: 0,
				nonIncremental: 0,
				failed: 0,
				totalExecTimeSeconds: 0,
			};
			eb.total++;
			eb.totalExecTimeSeconds += r.execTimeSeconds;

			switch (r.outcome) {
				case TaskCacheOutcome.CacheHitInitial: {
					cacheHitInitial++;
					eb.cached++;
					break;
				}
				case TaskCacheOutcome.CacheHitRecheck: {
					cacheHitRecheck++;
					eb.cached++;
					break;
				}
				case TaskCacheOutcome.CacheMiss: {
					cacheMiss++;
					eb.miss++;
					break;
				}
				case TaskCacheOutcome.NonIncremental: {
					nonIncremental++;
					eb.nonIncremental++;
					break;
				}
				case TaskCacheOutcome.Failed: {
					failed++;
					eb.failed++;
					break;
				}
				case TaskCacheOutcome.NotRun: {
					notRun++;
					break;
				}
			}

			byExec.set(r.executable, eb);
		}

		const totalTasks = this.records.length;
		const totalCached = cacheHitInitial + cacheHitRecheck;
		const cacheHitRate = totalTasks > 0 ? totalCached / totalTasks : 0;

		const cacheableTasks = totalTasks - nonIncremental - notRun;
		const cacheableHitRate = cacheableTasks > 0 ? totalCached / cacheableTasks : 0;

		// Sort executable breakdown by total count descending
		const byExecutable = [...byExec.values()].sort((a, b) => b.total - a.total);

		return {
			totalTasks,
			cacheHitInitial,
			cacheHitRecheck,
			cacheMiss,
			nonIncremental,
			failed,
			notRun,
			cacheHitRate,
			cacheableHitRate,
			byExecutable,
		};
	}

	public printSummary(): void {
		if (this.records.length === 0) {
			return;
		}

		const s = this.getSummary();
		const totalCached = s.cacheHitInitial + s.cacheHitRecheck;
		const executed = s.cacheMiss;

		log("");
		log(chalk.bold("Build Cache Metrics:"));
		log(
			`  Tasks: ${s.totalTasks} total, ${totalCached} cached, ${executed} executed, ${s.nonIncremental} non-incremental, ${s.failed} failed`,
		);
		log(
			`  Cache hit rate: ${formatPercent(s.cacheHitRate)} overall, ${formatPercent(s.cacheableHitRate)} of cacheable tasks`,
		);

		if (s.byExecutable.length > 0) {
			log("  By executable:");
			for (const eb of s.byExecutable) {
				const cachedPct =
					eb.total > 0 ? formatPercent(eb.cached / eb.total) : "0%";
				log(
					`    ${eb.executable}: ${eb.total} tasks, ${eb.cached} cached (${cachedPct}), ${eb.miss} miss [${eb.totalExecTimeSeconds.toFixed(1)}s]`,
				);
			}
		}
	}

	public printVerboseDetails(): void {
		if (this.records.length === 0) {
			return;
		}

		// Cache misses sorted by exec time descending
		const misses = this.records
			.filter((r) => r.outcome === TaskCacheOutcome.CacheMiss)
			.sort((a, b) => b.execTimeSeconds - a.execTimeSeconds);

		if (misses.length > 0) {
			log(`  Cache misses (${misses.length} tasks, sorted by exec time):`);
			for (const r of misses) {
				const workerTag = r.worker ? " [worker]" : "";
				log(
					`    ${r.packageName}#${r.taskName} ${r.executable}${workerTag} - ${r.execTimeSeconds.toFixed(3)}s`,
				);
			}
		}

		// Non-incremental tasks
		const nonIncremental = this.records.filter(
			(r) => r.outcome === TaskCacheOutcome.NonIncremental,
		);
		if (nonIncremental.length > 0) {
			log(`  Non-incremental (${nonIncremental.length} tasks):`);
			for (const r of nonIncremental) {
				log(
					`    ${r.packageName}#${r.taskName} ${r.executable} - ${r.execTimeSeconds.toFixed(3)}s`,
				);
			}
		}

		// Failed tasks
		const failed = this.records.filter(
			(r) => r.outcome === TaskCacheOutcome.Failed,
		);
		if (failed.length > 0) {
			log(`  Failed (${failed.length} tasks):`);
			for (const r of failed) {
				log(
					`    ${r.packageName}#${r.taskName} ${r.executable} - ${r.execTimeSeconds.toFixed(3)}s`,
				);
			}
		}
	}

	public async writeJsonFile(filePath: string): Promise<void> {
		const output: BuildMetricsJson = {
			timestamp: new Date().toISOString(),
			summary: this.getSummary(),
			tasks: this.records,
		};
		await writeFile(filePath, JSON.stringify(output, undefined, 2));
	}
}

function formatPercent(ratio: number): string {
	return `${(ratio * 100).toFixed(1)}%`;
}
