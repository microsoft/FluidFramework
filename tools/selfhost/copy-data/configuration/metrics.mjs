/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance } from "node:perf_hooks";

/** Aggregate safe stage timings without retaining document contents or unbounded samples. */
export function createMetrics(now = () => performance.now()) {
	const started = now();
	const stages = new Map();
	let retries = 0;
	let bytes = 0;
	let active = 0;
	let peakWorkers = 0;
	const startMeasurement = (stage) => {
		const start = now();
		let recorded = false;
		return () => {
			if (recorded) return;
			recorded = true;
			const duration = Math.max(0, now() - start);
			const data = stages.get(stage) ?? {
				count: 0,
				totalMs: 0,
				maxMs: 0,
				buckets: Array(32).fill(0),
			};
			data.count++;
			data.totalMs += duration;
			data.maxMs = Math.max(data.maxMs, duration);
			data.buckets[Math.min(31, Math.ceil(Math.log2(Math.max(1, duration))))]++;
			stages.set(stage, data);
		};
	};
	return {
		start: startMeasurement,
		async measure(stage, operation) {
			const stop = startMeasurement(stage);
			try {
				return await operation();
			} finally {
				stop();
			}
		},
		retry() {
			retries++;
		},
		bytes(count) {
			bytes += count;
		},
		enter() {
			active++;
			peakWorkers = Math.max(peakWorkers, active);
		},
		leave() {
			active--;
		},
		snapshot(documents = 0) {
			const elapsedMs = Math.max(0, now() - started);
			const percentile = (data, fraction) => {
				let cumulative = 0;
				for (const [index, count] of data.buckets.entries()) {
					cumulative += count;
					if (cumulative >= Math.ceil(data.count * fraction)) return 2 ** index;
				}
				return 0;
			};
			return {
				elapsedMs,
				documentsPerMinute: elapsedMs > 0 ? (documents * 60_000) / elapsedMs : 0,
				responseBytes: bytes,
				retries,
				peakWorkers,
				percentileMethod: "log2-upper-bound-ms",
				stages: Object.fromEntries(
					[...stages].map(([stage, data]) => [
						stage,
						{
							count: data.count,
							totalMs: data.totalMs,
							maxMs: data.maxMs,
							p50Ms: percentile(data, 0.5),
							p95Ms: percentile(data, 0.95),
						},
					]),
				),
			};
		},
	};
}
