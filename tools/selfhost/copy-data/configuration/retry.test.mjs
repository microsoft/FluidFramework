/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { retry } from "./retry.mjs";
import { parseCopyOptions } from "./options.mjs";
import { createMetrics } from "./metrics.mjs";

test("retries only explicitly transient failures with bounded backoff and Retry-After", async () => {
	const waits = [];
	let attempts = 0;
	await retry(
		async () => {
			if (++attempts < 3)
				throw Object.assign(new Error("not logged"), { retryable: true, retryAfterMs: 1000 });
		},
		{ sleep: async (ms) => waits.push(ms), random: () => 0.5 },
	);
	assert.equal(attempts, 3);
	assert.deepEqual(waits, [1000, 1000]);
	for (const error of [new Error("permanent"), { retryable: true, retryAfterMs: 60_001 }]) {
		let calls = 0;
		await assert.rejects(
			retry(async () => {
				calls++;
				throw error;
			}),
		);
		assert.equal(calls, 1);
	}
});

test("rejects invalid CLI options before execution and derives the payload-bounded worker limit", () => {
	assert.equal(parseCopyOptions(["--execute"]).workers, 1);
	assert.equal(parseCopyOptions(["--execute"]).ignoreLogTail, false);
	const override = parseCopyOptions([
		"--execute",
		"--ignore-logtail",
		"--failed-only",
		"reviewed.json",
		"--concurrency",
		"2",
	]);
	assert.equal(override.ignoreLogTail, true);
	assert.equal(override.concurrency, 2);
	assert.ok(override.failedOnly.endsWith("reviewed.json"));
	assert.deepEqual(override.copyArgs, [
		"--ignore-logtail",
		"--failed-only",
		"reviewed.json",
		"--concurrency",
		"2",
	]);
	assert.equal(
		parseCopyOptions(["--execute", "--concurrency", "4", "--memory-budget-mib", "128"])
			.workers,
		1,
	);
	for (const args of [
		["--execute", "--concurrency", "5"],
		["--execute", "--attempts", "0"],
		["--execute", "--request-timeout-ms", "45001"],
		["--execute", "--config"],
		["--execute", "--failed-only"],
		["--execute", "--memory-budget-mib", "2"],
		["--execute", "--concurrency", "1.5"],
		["--execute", "--ignore-logtail=false"],
	])
		assert.throws(() => parseCopyOptions(args));
});

test("stage timing excludes key callback work and records bounded histograms on failure", async () => {
	let time = 0;
	const metrics = createMetrics(() => time);
	const stop = metrics.start("source-key");
	time = 8;
	stop();
	time = 100;
	stop();
	await assert.rejects(
		metrics.measure("download", async () => {
			time += 10;
			throw new Error();
		}),
	);
	const snapshot = metrics.snapshot(2);
	assert.equal(snapshot.stages["source-key"].totalMs, 8);
	assert.equal(snapshot.stages.download.count, 1);
	assert.equal(snapshot.stages.download.p95Ms, 16);
	assert.equal(snapshot.documentsPerMinute, (2 * 60_000) / 110);
});
