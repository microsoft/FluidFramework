import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { resolve } from "node:path";

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
if (backend === "rust" && (!transport || !/^[0-9a-f]{64}$/iu.test(hash ?? ""))) {
	throw new Error("the Rust backend requires a transport URL and certificate SHA-256 hash");
}

const packageRoot = resolve(import.meta.dirname, "..");
const page = `shared-tree-benchmark-${backend === "rust-local" ? "rust" : backend}.html`;
const sourceCommit = spawnSync("git", ["rev-parse", "HEAD"], {
	cwd: packageRoot,
	encoding: "utf8",
}).stdout.trim();
const sourceDirty =
	spawnSync(
		"git",
		[
			"status",
			"--porcelain",
			"--",
			":(top)**",
			":(exclude,top)rust-service/benchmarks/shared-tree/**",
		],
		{
			cwd: packageRoot,
			encoding: "utf8",
		},
	).stdout.trim().length > 0;
const serviceProcessBefore = readServiceProcess();
const samples = [];
for (let repetition = 0; repetition < repetitions; repetition++) {
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
				operations: String(operations),
				warmup: String(warmup),
				...(operationsPerTurn === undefined
					? {}
					: { operationsPerTurn: String(operationsPerTurn) }),
				...(backend === "rust-local" ? { local: "true", storage: "memory" } : {}),
				...(backend === "rust"
					? { storage: process.env.FLUID_SERVICE_STORAGE_MODE ?? "durable-file" }
					: {}),
			}).toString(),
		],
		{ encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
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
		repetitions,
		operations,
		warmup,
		operationsPerTurn: operationsPerTurn ?? null,
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
