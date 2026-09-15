/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { extname, resolve } from "node:path";

const [
	backend,
	repetitionsText = "10",
	operationsText = "100",
	warmupText = "10",
	transport,
	hash,
] = process.argv.slice(2);
if (
	backend !== "rust-local" &&
	backend !== "rust" &&
	backend !== "local" &&
	backend !== "tinylicious"
) {
	throw new Error(
		"usage: node run-shared-tree-benchmark.mjs <rust-local|rust|local|tinylicious> [repetitions] [operations] [warmup] [rust-transport-url] [rust-certificate-sha256-hex]",
	);
}
const repetitions = positiveInteger(repetitionsText, "repetitions");
const operations = positiveInteger(operationsText, "operations");
const warmup = nonnegativeInteger(warmupText, "warmup");
const operationsPerTurn =
	process.env.BENCHMARK_OPERATIONS_PER_TURN === undefined
		? undefined
		: positiveInteger(process.env.BENCHMARK_OPERATIONS_PER_TURN, "operationsPerTurn");
const synchronizePerTurn = booleanEnvironmentVariable("BENCHMARK_SYNCHRONIZE_PER_TURN");
const subscriptionBatchOperations =
	process.env.BENCHMARK_SUBSCRIPTION_BATCH_OPERATIONS === undefined
		? 64
		: positiveInteger(
				process.env.BENCHMARK_SUBSCRIPTION_BATCH_OPERATIONS,
				"subscriptionBatchOperations",
			);
const integration = process.env.BENCHMARK_INTEGRATION ?? "fluid";
if (integration !== "fluid" && integration !== "direct") {
	throw new Error("BENCHMARK_INTEGRATION must be fluid or direct");
}
const dataStructure = process.env.BENCHMARK_DDS ?? "dummy";
if (dataStructure !== "dummy" && dataStructure !== "shared-tree") {
	throw new Error("BENCHMARK_DDS must be dummy or shared-tree");
}
if (synchronizePerTurn && operationsPerTurn === undefined) {
	throw new Error("BENCHMARK_SYNCHRONIZE_PER_TURN=1 requires BENCHMARK_OPERATIONS_PER_TURN");
}
if (backend === "rust" && (!transport || !/^[0-9a-f]{64}$/iu.test(hash ?? ""))) {
	throw new Error("the Rust backend requires a transport URL and certificate SHA-256 hash");
}

const packageRoot = resolve(import.meta.dirname, "..");
const page = `shared-tree-benchmark-${backend === "rust-local" ? "rust" : backend}.html`;
const sourceCommitResult = spawnSync("git", ["rev-parse", "HEAD"], {
	cwd: packageRoot,
	encoding: "utf8",
});
const sourceStatusResult = spawnSync(
	"git",
	["status", "--porcelain", "--untracked-files=normal"],
	{
		cwd: packageRoot,
		encoding: "utf8",
	},
);
if (sourceCommitResult.status !== 0 || sourceStatusResult.status !== 0) {
	throw new Error(
		`failed to capture source provenance:\n${sourceCommitResult.stderr}${sourceStatusResult.stderr}`,
	);
}
const sourceCommit = sourceCommitResult.stdout.trim();
const sourceDirty = sourceStatusResult.stdout.trim().length > 0;
const serviceProcessBefore = readServiceProcess();
const samples = [];
for (let repetition = 0; repetition < repetitions; repetition++) {
	const cpuProfilePath = profilePathForRepetition(
		process.env.BENCHMARK_CPU_PROFILE_PATH,
		repetition + 1,
		repetitions,
	);
	const execution = spawnSync(
		process.execPath,
		[
			resolve(import.meta.dirname, "run-headless.mjs"),
			packageRoot,
			transport ?? "https://unused.invalid",
			hash ?? "0".repeat(64),
			"__sharedTreeBenchmarkResult",
			page,
			new URLSearchParams({
				dds: dataStructure,
				operations: String(operations),
				warmup: String(warmup),
				subscriptionBatchOperations: String(subscriptionBatchOperations),
				integration,
				...(operationsPerTurn === undefined
					? {}
					: { operationsPerTurn: String(operationsPerTurn) }),
				...(synchronizePerTurn ? { synchronizePerTurn: "true" } : {}),
				...(backend === "tinylicious" && process.env.BENCHMARK_TINYLICIOUS_PORT !== undefined
					? { tinyliciousPort: process.env.BENCHMARK_TINYLICIOUS_PORT }
					: {}),
				...(backend === "rust-local" ? { local: "true", storage: "memory" } : {}),
				...(backend === "rust"
					? { storage: process.env.FLUID_SERVICE_STORAGE_MODE ?? "durable-file" }
					: {}),
			}).toString(),
		],
		{
			encoding: "utf8",
			env: {
				...process.env,
				...(cpuProfilePath === undefined
					? {}
					: { BENCHMARK_CPU_PROFILE_PATH: cpuProfilePath }),
			},
			maxBuffer: 10 * 1024 * 1024,
		},
	);
	const evidence = execution.stdout.match(/^BROWSER_EVIDENCE=(.*)$/mu)?.[1];
	if (execution.status !== 0 || evidence === undefined) {
		throw new Error(
			`benchmark repetition ${repetition + 1} failed:\n${execution.stdout}\n${execution.stderr}`,
		);
	}
	const sample = JSON.parse(evidence);
	if (sample.status !== "passed") {
		throw new Error(`benchmark repetition ${repetition + 1} failed: ${evidence}`);
	}
	samples.push(sample);
}

const cpu = cpus()[0];
const serviceProcessAfter = readServiceProcess();
const values = (select) => samples.map(select);
const output = {
	schemaVersion: 1,
	status: "passed",
	provisional: true,
	backend: samples[0].backend,
	sourceCommit,
	sourceDirty,
	configuration: {
		dataStructure,
		repetitions,
		operations,
		warmup,
		operationsPerTurn: operationsPerTurn ?? null,
		synchronizePerTurn,
		subscriptionBatchOperations,
		integration,
		clients: samples[0].clientCount,
	},
	environment: {
		capturedAt: new Date().toISOString(),
		platform: platform(),
		kernel: release(),
		architecture: process.arch,
		logicalCpuCount: cpus().length,
		cpuModel: cpu?.model ?? "unknown",
		node: process.version,
		browser: samples[0].browser,
		serviceProcess:
			serviceProcessBefore === null || serviceProcessAfter === null
				? null
				: {
						pid: serviceProcessAfter.pid,
						cpuSeconds:
							(serviceProcessAfter.cpuTicks - serviceProcessBefore.cpuTicks) /
							serviceProcessAfter.clockTicksPerSecond,
						residentSetKiB: serviceProcessAfter.residentSetKiB,
						peakResidentSetKiB: serviceProcessAfter.peakResidentSetKiB,
					},
	},
	aggregates: {
		startupMilliseconds: distribution(values((sample) => sample.startupMilliseconds)),
		submissionMilliseconds: distribution(values((sample) => sample.submissionMilliseconds)),
		convergenceMilliseconds: distribution(values((sample) => sample.convergenceMilliseconds)),
		operationsPerSecond: distribution(values((sample) => sample.operationsPerSecond)),
	},
	samples,
};
console.log(JSON.stringify(output, undefined, 2));

function readServiceProcess() {
	const pid = Number(process.env.BENCHMARK_SERVER_PID);
	if (!Number.isSafeInteger(pid) || pid <= 0) {
		return null;
	}
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
		const fields = stat
			.slice(stat.lastIndexOf(")") + 2)
			.trim()
			.split(/\s+/u);
		const status = readFileSync(`/proc/${pid}/status`, "utf8");
		const valueKiB = (name) =>
			Number(status.match(new RegExp(`^${name}:\\s+(\\d+)`, "mu"))?.[1]);
		const clockTicksPerSecond = Number(
			spawnSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).stdout.trim(),
		);
		return {
			pid,
			cpuTicks: Number(fields[11]) + Number(fields[12]),
			clockTicksPerSecond,
			residentSetKiB: valueKiB("VmRSS"),
			peakResidentSetKiB: valueKiB("VmHWM"),
		};
	} catch {
		return null;
	}
}

function distribution(samples) {
	const sorted = [...samples].sort((left, right) => left - right);
	const mean = samples.reduce((total, sample) => total + sample, 0) / samples.length;
	const sampleStandardDeviation =
		samples.length === 1
			? 0
			: Math.sqrt(
					samples.reduce((total, sample) => total + (sample - mean) ** 2, 0) /
						(samples.length - 1),
				);
	return {
		minimum: sorted[0],
		mean,
		median: percentile(sorted, 0.5),
		p95: percentile(sorted, 0.95),
		maximum: sorted.at(-1),
		sampleStandardDeviation,
	};
}

function percentile(sorted, fraction) {
	return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function profilePathForRepetition(basePath, repetition, repetitionCount) {
	if (basePath === undefined || repetitionCount === 1) {
		return basePath;
	}
	const extension = extname(basePath);
	const stem = extension === "" ? basePath : basePath.slice(0, -extension.length);
	return resolve(`${stem}-${repetition}${extension || ".cpuprofile"}`);
}

function positiveInteger(text, name) {
	const value = Number(text);
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
	return value;
}

function nonnegativeInteger(text, name) {
	const value = Number(text);
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${name} must be a nonnegative integer`);
	}
	return value;
}

function booleanEnvironmentVariable(name) {
	const value = process.env[name];
	if (value === undefined || value === "0") {
		return false;
	}
	if (value === "1") {
		return true;
	}
	throw new Error(`${name} must be 0 or 1`);
}
