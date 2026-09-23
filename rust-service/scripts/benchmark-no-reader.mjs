/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { alignedMeasurement } from "./benchmark-alignment.mjs";

const [binary, backend, cache, directory] = process.argv.slice(2);
assert.ok(["memory", "buffered-file", "durable-file"].includes(backend));
assert.ok(["true", "false"].includes(cache));
const output = resolve(directory);
mkdirSync(output, { recursive: true });
const child = spawn(
	"taskset",
	["-c", "0,2,4,6,8,10,12,14", resolve(binary), backend, resolve(output, "data")],
	{ stdio: ["pipe", "pipe", "pipe"] },
);
const ticks = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }));
const anchor = performance.now();
const epoch = Date.now() * 1000;
const now = () => Math.round(epoch + (performance.now() - anchor) * 1000);
let start;
let timed;
let result;
let failure;
let samplingEnded;
let log = "";
const samples = [];
const fail = (error) => {
	failure ??= String(error);
	child.kill("SIGTERM");
};
const sample = () => {
	try {
		const before = now();
		const status = readFileSync(`/proc/${child.pid}/status`, "utf8");
		if (/^State:\s+[ZX]/m.test(status)) {
			samplingEnded = "process terminated";
			clearInterval(timer);
			return;
		}
		const stat = readFileSync(`/proc/${child.pid}/stat`, "utf8").split(") ")[1].split(" ");
		const after = now();
		const entry = {
			seconds: start === undefined ? -1 : (performance.now() - start) / 1000,
			epochBeforeMicros: before,
			epochAfterMicros: after,
			clockDiscrepancyMicros: Math.abs(Date.now() * 1000 - now()),
			beforeReplay: timed === undefined,
			service: {
				cpuTicks: Number(stat[11]) + Number(stat[12]),
				rssKiB: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]),
				peakRssKiB: Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1]),
			},
		};
		assert.ok(Number.isFinite(entry.service.rssKiB), "missing RSS");
		samples.push(entry);
		if (entry.service.rssKiB > 4 * 1024 * 1024) fail("4 GiB sampled RSS guard");
		if (entry.clockDiscrepancyMicros > 2000) fail("host clock jump");
	} catch (error) {
		if (error.code === "ENOENT") {
			samplingEnded = "process disappeared";
			clearInterval(timer);
			return;
		}
		fail(error);
	}
};
const timer = setInterval(sample, 250);
const deadline = setTimeout(() => fail("120 s outer deadline"), 120_000);
child.stderr.on("data", (data) => {
	log += data;
});
child.on("error", fail);
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
	log += `${line}\n`;
	try {
		const message = JSON.parse(line);
		if (message.type === "ready") {
			assert.equal(message.liveCache, cache === "true");
			assert.equal(message.subscriptionsDuringWrites, 0);
			start = performance.now();
			sample();
			child.stdin.write("start\n");
		} else if (message.type === "timed-result") {
			sample();
			timed = message;
			child.stdin.write("replay\n");
		} else if (message.type === "result") {
			result = message;
			samplingEnded = "replay result received";
			clearInterval(timer);
		}
	} catch (error) {
		fail(error);
	}
});
await new Promise((done) =>
	child.on("close", (code, signal) => {
		clearInterval(timer);
		clearTimeout(deadline);
		if (code !== 0) failure ??= `child exit ${code}, signal ${signal}`;
		done();
	}),
);
let summary;
try {
	assert.equal(failure, undefined);
	assert.ok(timed && result, "missing measured phase or finite replay");
	const measured = samples.filter(
		(entry) => entry.beforeReplay && entry.seconds >= 3 && entry.seconds <= 13,
	);
	const workers = timed.workers;
	assert.equal(
		result.replayed,
		workers.reduce((sum, worker) => sum + worker.sent, 0),
	);
	assert.equal(result.integrityErrors, 0);
	assert.ok(workers.every((worker) => worker.acknowledged === worker.sent));
	assert.ok(
		timed.cacheAllocation.every(
			(stats) =>
				stats.subscriptions === 0 &&
				stats.claims === 0 &&
				stats.entries === 0 &&
				stats.payload_bytes === 0,
		),
	);
	summary = {
		status: "completed",
		boundary: "direct-fixture-process-including-identical-pacing",
		configuration: {
			backend: "sea",
			storage: backend,
			payloadBytes: 64,
			documents: 32,
			rate: 1000,
			seconds: 10,
			warmupSeconds: 3,
			liveCache: cache === "true",
		},
		aligned: alignedMeasurement(
			measured[0],
			measured.at(-1),
			workers,
			ticks,
			"acknowledgmentEpochMicros",
		),
		sustainable:
			workers.reduce((sum, worker) => sum + worker.measuredSent, 0) >= 9800 &&
			workers.reduce((sum, worker) => sum + worker.deliveredInWindow, 0) >= 9800 &&
			workers.every(
				(worker) =>
					worker.latencyMilliseconds.p95 !== null &&
					worker.latencyMilliseconds.p95 <= 100 &&
					worker.maxScheduleLagMilliseconds <= 100,
			),
		serviceMeanRssMiB:
			measured.reduce((sum, entry) => sum + entry.service.rssKiB, 0) / measured.length / 1024,
		servicePeakRssMiB:
			Math.max(
				...samples
					.filter((entry) => entry.beforeReplay)
					.map((entry) => entry.service.peakRssKiB),
			) / 1024,
		workers,
		replay: result,
		cacheAllocation: timed.cacheAllocation,
	};
} catch (error) {
	summary = {
		status: "failed",
		error: String(error),
		failure,
		timed,
		replay: result,
	};
}
writeFileSync(resolve(output, "service.log"), log);
writeFileSync(
	resolve(output, "result.json"),
	`${JSON.stringify({ ...summary, samplingEnded, resourceSamples: samples }, null, "\t")}\n`,
);
console.log(JSON.stringify({ ...summary, workers: undefined }));
if (summary.status !== "completed") process.exitCode = 1;
