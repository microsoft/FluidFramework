/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	assertSampleGates,
	baselineP95IsStable,
	candidateRssLimit,
} from "./benchmark-gates.mjs";

const [artifactDirectory, cell, resume, acceptedPrimaryEvidence] = process.argv.slice(2);
assert.ok(resume === undefined || resume === "--resume" || resume === "--accepted-primary");
assert.equal(acceptedPrimaryEvidence !== undefined, resume === "--accepted-primary");
if (acceptedPrimaryEvidence) assert.ok(existsSync(resolve(acceptedPrimaryEvidence)));
const artifacts = resolve(artifactDirectory);
const cells = {
	primary: ["durable-file", 64, false],
	memory64: ["memory", 64, false],
	buffered64: ["buffered-file", 64, false],
	memory8192: ["memory", 8192, false],
	buffered8192: ["buffered-file", 8192, false],
	durable8192: ["durable-file", 8192, false],
	"no-reader-memory": ["memory", 64, true],
	"no-reader-buffered": ["buffered-file", 64, true],
	"no-reader-durable": ["durable-file", 64, true],
};
assert.ok(Object.hasOwn(cells, cell), "unknown frozen cell");
const [storage, payloadBytes, direct] = cells[cell];
const output = resolve(artifacts, "samples", cell);
assert.ok(resume === "--resume" || !existsSync(output), "never overwrite a measured attempt");
const previous =
	resume === "--resume"
		? JSON.parse(readFileSync(resolve(output, "summary.json")))
		: undefined;
if (previous)
	writeFileSync(
		resolve(output, "summary-before-resume.json"),
		`${JSON.stringify(previous, null, "\t")}\n`,
		{ flag: "wx" },
	);
if (cell !== "primary" && !acceptedPrimaryEvidence) {
	const primary = JSON.parse(readFileSync(resolve(artifacts, "samples/primary/summary.json")));
	assert.equal(primary.status, "passed", "primary must pass before controls");
}
mkdirSync(output, { recursive: true });
const binaries = {
	baseline: resolve(artifacts, "target-baseline/release/sea-webtransport-server"),
	candidate: resolve(artifacts, "target-candidate/release/sea-webtransport-server"),
	generator: resolve(artifacts, "target-candidate/release/presentation-native"),
};
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const runs = previous?.runs ?? [];
const pairs = [];
const summary = {
	cell,
	status: "running",
	runs,
	pairs,
	acceptedPrimaryEvidence: acceptedPrimaryEvidence
		? { path: resolve(acceptedPrimaryEvidence), sha256: hash(acceptedPrimaryEvidence) }
		: undefined,
};
const persist = () =>
	writeFileSync(resolve(output, "summary.json"), `${JSON.stringify(summary, null, "\t")}\n`);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const p95 = (result) =>
	Math.max(...result.workers.map((worker) => worker.latencyMilliseconds.p95));
try {
	for (let pair = 0; pair < 3; pair++) {
		const matched = {};
		for (const side of pair === 1 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
			const available =
				Number(readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+)/m)[1]) *
				1024;
			const disk = statfsSync("/tmp");
			assert.ok(
				available >= 8 * 1024 ** 3 && disk.bavail * disk.bsize >= 4 * 1024 ** 3,
				"resource preflight",
			);
			const directory = resolve(output, `pair${pair + 1}-${side}`);
			const configuration = {
				backend: "sea",
				generator: "native",
				transport: "websocket",
				documents: 32,
				cores: 8,
				rate: 1000,
				payloadBytes,
				warmupSeconds: 3,
				seconds: 10,
				storage,
				liveCache: side === "candidate",
				serverBinary: binaries[side],
				generatorBinary: binaries.generator,
			};
			const binary = direct
				? resolve(artifacts, `target-${side}/release/checkpoint-no-reader`)
				: binaries[side];
			const script = resolve(
				import.meta.dirname,
				direct ? "benchmark-no-reader.mjs" : "benchmark-stress.mjs",
			);
			const args = direct
				? [script, binary, storage, String(side === "candidate"), directory]
				: [script, "run", JSON.stringify(configuration), directory];
			const record = {
				pair: pair + 1,
				side,
				directory,
				command: [process.execPath, ...args],
				environment: { SEA_MAX_CONNECTIONS: "128" },
				startedAt: new Date().toISOString(),
				binarySha256: hash(binary),
				generatorSha256: hash(binaries.generator),
				runnerSha256: hash(script),
				alignmentSha256: hash(resolve(import.meta.dirname, "benchmark-alignment.mjs")),
				temporaryDataSha256: hash(
					resolve(import.meta.dirname, "benchmark-temporary-data.mjs"),
				),
				generatorLayoutSha256: hash(
					resolve(import.meta.dirname, "benchmark-generator-layout.mjs"),
				),
			};
			const existing = runs.find((run) => run.pair === pair + 1 && run.side === side);
			if (existing) {
				for (const key of [
					"binarySha256",
					"generatorSha256",
					"runnerSha256",
					"alignmentSha256",
					"temporaryDataSha256",
					"generatorLayoutSha256",
				])
					assert.equal(
						existing[key],
						record[key],
						`cannot resume changed measured input: ${key}`,
					);
				assert.equal(existing.exitCode, 0, "cannot resume an unsuccessful process");
				assert.deepEqual(existing.command, record.command, "cannot resume changed workload");
			} else {
				runs.push(record);
				persist();
				const execution = spawnSync(process.execPath, args, {
					encoding: "utf8",
					timeout: 130_000,
					env: { ...process.env, SEA_MAX_CONNECTIONS: "128" },
					maxBuffer: 32 * 1024 ** 2,
				});
				Object.assign(record, {
					exitCode: execution.status,
					signal: execution.signal,
					error: execution.error?.message,
					finishedAt: new Date().toISOString(),
				});
				writeFileSync(
					resolve(output, `pair${pair + 1}-${side}.log`),
					`${execution.stdout ?? ""}${execution.stderr ?? ""}`,
				);
				persist();
				assert.equal(execution.status, 0, `${side} process failure`);
			}
			const result = JSON.parse(readFileSync(resolve(directory, "result.json")));
			matched[side] = result;
			(existing ?? record).cpuPerOperation =
				result.aligned?.serviceCpuSecondsPerDeliveredOperation;
			(existing ?? record).p95Milliseconds =
				result.status === "completed" ? p95(result) : null;
			assertSampleGates(result, side);
			persist();
		}
		const { baseline, candidate } = matched;
		const pairResult = {
			pair: pair + 1,
			cpuRatio:
				candidate.aligned.serviceCpuSecondsPerDeliveredOperation /
				baseline.aligned.serviceCpuSecondsPerDeliveredOperation,
			baselineP95: p95(baseline),
			candidateP95: p95(candidate),
			baselineMeanRssMiB: baseline.serviceMeanRssMiB,
			candidateMeanRssMiB: candidate.serviceMeanRssMiB,
			baselinePeakRssMiB: baseline.servicePeakRssMiB,
			candidatePeakRssMiB: candidate.servicePeakRssMiB,
		};
		pairs.push(pairResult);
		persist();
		assert.ok(
			p95(candidate) <= Math.max(p95(baseline) * 1.1, p95(baseline) + 1) &&
				p95(candidate) <= 100,
			"paired latency gate",
		);
		for (const metric of ["serviceMeanRssMiB", "servicePeakRssMiB"])
			assert.ok(
				candidate[metric] <= candidateRssLimit(baseline[metric]),
				`paired ${metric} gate`,
			);
	}
	const baseline = runs.filter((run) => run.side === "baseline");
	const variation = (metric) =>
		Math.max(...baseline.map((run) => run[metric])) /
			Math.min(...baseline.map((run) => run[metric])) -
		1;
	summary.baselineVariation = {
		cpu: variation("cpuPerOperation"),
		p95: variation("p95Milliseconds"),
	};
	if (cell === "primary") {
		assert.ok(
			summary.baselineVariation.cpu <= 0.1 &&
				baselineP95IsStable(baseline.map((run) => run.p95Milliseconds)),
			"primary baseline instability; stop and inspect host noise",
		);
	}
	summary.medianCpuRatio = median(pairs.map((pair) => pair.cpuRatio));
	assert.ok(
		summary.medianCpuRatio <= (cell === "primary" ? 0.9 : 1.05),
		"median CPU efficiency gate",
	);
	if (cell === "primary")
		assert.ok(
			pairs.filter((pair) => pair.cpuRatio < 1).length >= 2,
			"primary needs improvement in two pairs",
		);
	summary.status = "passed";
} catch (error) {
	summary.status = "blocked";
	summary.firstFailure = String(error);
	process.exitCode = 1;
} finally {
	persist();
}
console.log(JSON.stringify(summary, null, 2));
