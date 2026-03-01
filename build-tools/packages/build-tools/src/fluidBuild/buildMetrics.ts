/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { writeFile } from "node:fs/promises";

import chalk from "picocolors";
import type { Opaque } from "type-fest";

import { defaultLogger } from "../common/logging";

const { log } = defaultLogger;

export const TaskCacheOutcome = {
	CacheHitInitial: "cacheHitInitial",
	CacheHitRecheck: "cacheHitRecheck",
	CacheMiss: "cacheMiss",
	NonIncremental: "nonIncremental",
	Failed: "failed",
	NotRun: "notRun",
} as const;

export type TaskCacheOutcome = (typeof TaskCacheOutcome)[keyof typeof TaskCacheOutcome];

export type Seconds = Opaque<number, "Seconds">;

export interface TaskMetricRecord {
	taskName: string;
	packageName: string;
	command: string;
	executable: string;
	outcome: TaskCacheOutcome;
	isIncremental: boolean;
	supportsRecheck: boolean;
	execTimeSeconds: Seconds;
	queueWaitSeconds: Seconds;
	worker: boolean;
}

interface ExecutableBreakdown {
	executable: string;
	total: number;
	cached: number;
	miss: number;
	nonIncremental: number;
	failed: number;
	totalExecTimeSeconds: Seconds;
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
				totalExecTimeSeconds: 0 as Seconds,
			};
			eb.total++;
			eb.totalExecTimeSeconds = (eb.totalExecTimeSeconds + r.execTimeSeconds) as Seconds;

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

		log("");
		log(chalk.bold("Build Cache Metrics"));
		log("");

		// Summary line with colored highlights
		const cachedStr = chalk.green(`${totalCached} cached`);
		const hitRateStr = chalk.green(formatPercent(s.cacheHitRate));
		const executedStr =
			s.cacheMiss > 0 ? chalk.yellow(`${s.cacheMiss} executed`) : "0 executed";
		const failedStr = s.failed > 0 ? chalk.red(` | ${s.failed} failed`) : "";
		const nonIncStr =
			s.nonIncremental > 0 ? chalk.yellow(` | ${s.nonIncremental} non-incremental`) : "";

		log(
			`  ${chalk.bold(String(s.totalTasks))} tasks | ${cachedStr} (${hitRateStr}) | ${executedStr}${nonIncStr}${failedStr}`,
		);

		// Table of executables that had cache misses (the interesting ones)
		const withMisses = s.byExecutable.filter(
			(eb) => eb.miss > 0 || eb.failed > 0 || eb.nonIncremental > 0,
		);
		const fullyCached = s.byExecutable.filter(
			(eb) => eb.miss === 0 && eb.failed === 0 && eb.nonIncremental === 0,
		);

		if (withMisses.length > 0) {
			// Sort by execution time descending so the slowest are at the top
			withMisses.sort((a, b) => b.totalExecTimeSeconds - a.totalExecTimeSeconds);

			const nameWidth = Math.max(...withMisses.map((eb) => eb.executable.length), 10);

			log("");
			log(
				chalk.dim(
					`  ${"Executable".padEnd(nameWidth)}  Total  Cached  Miss  Hit Rate     Time`,
				),
			);
			log(chalk.dim(`  ${"─".repeat(nameWidth)}  ─────  ──────  ────  ────────  ───────`));

			for (const eb of withMisses) {
				const time = formatTime(eb.totalExecTimeSeconds);
				const missStr = eb.miss > 0 ? chalk.yellow(pad(eb.miss, 4)) : pad(eb.miss, 4);
				const hitRate = eb.total > 0 ? formatPercent(eb.cached / eb.total) : "0%";
				const hitRateStr = hitRate.padStart(8);
				const failStr = eb.failed > 0 ? `  ${chalk.red(`${eb.failed} failed`)}` : "";
				log(
					`  ${chalk.bold(eb.executable.padEnd(nameWidth))}  ${pad(eb.total, 5)}  ${pad(eb.cached, 6)}  ${missStr}  ${hitRateStr}  ${time.padStart(7)}${failStr}`,
				);
			}
		}

		// Summarize fully-cached executables in one line
		if (fullyCached.length > 0) {
			const fullyCachedTasks = fullyCached.reduce((sum, eb) => sum + eb.total, 0);
			log(chalk.dim(`  + ${fullyCached.length} fully cached (${fullyCachedTasks} tasks)`));
		}

		// Always list non-incremental tasks by name — these are warnings worth investigating
		const nonIncremental = this.records.filter(
			(r) => r.outcome === TaskCacheOutcome.NonIncremental,
		);
		if (nonIncremental.length > 0) {
			log("");
			log(
				chalk.yellow(chalk.bold(`  Non-incremental tasks`)) +
					chalk.dim(` (${nonIncremental.length} — not cacheable, may be worth investigating)`),
			);
			for (const r of nonIncremental) {
				log(
					`    ${chalk.yellow(formatTime(r.execTimeSeconds).padStart(7))}  ${r.packageName}#${r.taskName} ${chalk.dim(r.executable)}`,
				);
			}
		}

		log("");
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
			log(chalk.bold(`  Cache misses`) + chalk.dim(` (${misses.length} tasks)`));
			for (const r of misses) {
				const workerTag = r.worker ? chalk.dim(" [worker]") : "";
				log(
					`    ${chalk.yellow(formatTime(r.execTimeSeconds).padStart(7))}  ${r.packageName}#${r.taskName} ${chalk.dim(r.executable)}${workerTag}`,
				);
			}
			log("");
		}

		// Non-incremental tasks are already shown in printSummary()

		// Failed tasks
		const failed = this.records.filter((r) => r.outcome === TaskCacheOutcome.Failed);
		if (failed.length > 0) {
			log(chalk.bold(chalk.red(`  Failed`)) + chalk.dim(` (${failed.length} tasks)`));
			for (const r of failed) {
				log(
					`    ${formatTime(r.execTimeSeconds).padStart(7)}  ${r.packageName}#${r.taskName} ${chalk.dim(r.executable)}`,
				);
			}
			log("");
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

function formatTime(seconds: Seconds): string {
	const unit = (u: string): string => chalk.dim(u);
	let text: string;
	if (seconds === 0) {
		text = `0${unit("s")}`;
	} else if (seconds < 1) {
		text = `${(seconds * 1000).toFixed(0)}${unit("ms")}`;
	} else if (seconds < 60) {
		text = `${seconds.toFixed(1)}${unit("s")}`;
	} else {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		text = `${mins}${unit("m")}${secs.toFixed(0)}${unit("s")}`;
	}

	// Color based on duration: green < 15s, yellow 15-45s, red > 45s
	if (seconds <= 0) return text;
	if (seconds < 15) return chalk.green(text);
	if (seconds < 45) return chalk.yellow(text);
	return chalk.red(text);
}

function pad(n: number, width: number): string {
	return String(n).padStart(width);
}
