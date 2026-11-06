/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createTemporaryBenchmarkData } from "../../../scripts/benchmark-temporary-data.mjs";
import { freePort } from "../browser/chromium.mjs";
import {
	distribution,
	initializeNetwork,
	networkCounters,
	probeRtt,
	setRtt,
} from "./snapshot-network.mjs";

const packageRoot = resolve(import.meta.dirname, "..");
const root = resolve(packageRoot, "../../..");
const namespace = readlinkSync("/proc/self/ns/net");
const [mode, parentNamespace, json, outputPath] = process.argv.slice(2);
if (mode !== "--isolated") {
	const child = spawnSync(
		"unshare",
		[
			"--user",
			"--map-root-user",
			"--net",
			process.execPath,
			import.meta.filename,
			"--isolated",
			namespace,
			mode ?? "{}",
			parentNamespace ?? "benchmark-results/snapshots",
		],
		{ stdio: "inherit" },
	);
	if (child.error) throw child.error;
	process.exit(child.status ?? 1);
}
initializeNetwork(parentNamespace);
const config = {
	cases: ["direct", "direct-demand", "sea-fluid", "tinylicious"],
	bytes: [1024 * 1024, 10 * 1024 * 1024],
	rtts: [0, 100],
	repetitions: 10,
	concurrency: [1, 4, 16],
	capacityCount: 40,
	workers: 4,
	workload: "load",
	prefetchItems: 4096,
	prefetchBlobs: false,
	compression: false,
	blobBytes: 0,
	maxConnections: 16,
	rates: [],
	rateSeconds: 10,
	storage: "memory",
	...JSON.parse(json),
};
for (const name of ["bytes", "concurrency", "rates", "rtts"]) {
	assert.ok(Array.isArray(config[name]), `${name} must be an array`);
	assert.ok(
		config[name].every((n) => Number.isSafeInteger(n) && (name === "rtts" ? n >= 0 : n > 0)),
	);
}
assert.ok(Number.isSafeInteger(config.repetitions) && config.repetitions >= 0);
assert.equal(typeof config.prefetchBlobs, "boolean");
assert.equal(typeof config.compression, "boolean");
assert.ok(Number.isSafeInteger(config.blobBytes) && config.blobBytes >= 0);
assert.ok(
	config.blobBytes === 0 ||
		config.cases.every((name) => name === "direct" || name === "direct-demand"),
	"Blob-handle workloads require direct backends",
);
for (const name of [
	"capacityCount",
	"rateSeconds",
	"workers",
	"prefetchItems",
	"maxConnections",
]) {
	assert.ok(Number.isSafeInteger(config[name]) && config[name] > 0, name);
}
assert.ok(
	config.cases.length > 0 &&
		config.cases.every((name) =>
			["direct", "direct-demand", "sea-fluid", "tinylicious"].includes(name),
		),
);
assert.ok(["memory", "buffered-file", "durable-file"].includes(config.storage));
assert.ok(["load", "download"].includes(config.workload));
const output = resolve(outputPath);
mkdirSync(output, { recursive: true });
const services = [];
const samples = [];
const allowedCpus = readFileSync("/proc/self/status", "utf8")
	.match(/^Cpus_allowed_list:\s+(.+)$/mu)[1]
	.trim()
	.split(",")
	.flatMap((range) => {
		const [first, last = first] = range.split("-").map(Number);
		return Array.from({ length: last - first + 1 }, (_, index) => first + index);
	});
assert.ok(
	allowedCpus.length >= 4,
	"At least four logical CPUs are required for isolated CPU sets",
);
const serviceCpus = allowedCpus.slice(0, Math.min(4, Math.floor(allowedCpus.length / 2)));
const clientCpus = allowedCpus.slice(serviceCpus.length);
const clockTicks = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }));
const certificateDirectory = resolve(root, "rust-service/tests/webtransport-browser/.certs");
const native = resolve(root, "rust-service/target/release/sea-webtransport-server");
const bundle = resolve(packageRoot, "dist/shared-tree-snapshot.js");
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const manifest = {
	schemaVersion: 1,
	config,
	createdAt: new Date().toISOString(),
	sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
		cwd: root,
		encoding: "utf8",
	}).trim(),
	sourceStatus: execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }),
	artifacts: {
		bundleSha256: hash(bundle),
		runnerSha256: hash(import.meta.filename),
		networkHelperSha256: hash(resolve(import.meta.dirname, "snapshot-network.mjs")),
		serviceSha256: hash(native),
		wasmSha256: hash(
			resolve(
				root,
				`rust-service/packages/sea-typescript/generated/${config.compression ? "webtransport-compression" : "webtransport"}/web/sea_wasm_bg.wasm`,
			),
		),
	},
	environment: {
		cpu: cpus()[0]?.model,
		logicalCpus: cpus().length,
		kernel: release(),
		node: process.version,
		serviceCpus,
		clientCpus,
	},
	network: {
		parentNamespace,
		namespace,
		address: "127.0.0.2",
		oneWayDelay: "configured RTT / 2",
		probes: [],
	},
	qualifications: [
		"Fresh browser/profile per latency sample; warm services and OS caches.",
		"Open-to-connected-view plus representative read; JS bundle evaluation excluded, lazy WASM initialization included.",
		"Full tree verification follows timing; capacity includes verification and client teardown.",
		"Initial full snapshot, no application operation suffix. Direct snapshots use incremental chunk encoding.",
		"Capacity uses separate Chromium processes on client CPUs, against a hot document; not an established production service limit.",
		"Logical bytes and Sea blob API bytes are not transport bytes. Netem counters include both directions and protocol overhead.",
		"Download capacity retrieves a pinned snapshot and all unique blobs with eight concurrent readers; hashing is outside latency but inside throughput.",
		"Service CPU includes browser launch/teardown around samples. Tinylicious runs in-memory DB with filesystem Git storage.",
	],
};
function save() {
	writeFileSync(
		resolve(output, "samples.json"),
		`${JSON.stringify({ manifest, samples }, null, "\t")}\n`,
	);
}

async function stop(child) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise((resolve) => child.once("exit", resolve));
	child.kill("SIGTERM");
	const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
	try {
		await exited;
	} finally {
		clearTimeout(timeout);
	}
}

async function startService(tinylicious) {
	const data = createTemporaryBenchmarkData("snapshot-benchmark");
	const port = tinylicious ? await freePort() : undefined;
	const logs = [];
	const child = spawn(
		"taskset",
		[
			"-c",
			serviceCpus.join(","),
			tinylicious ? process.execPath : native,
			...(tinylicious
				? [
						resolve(root, "server/routerlicious/packages/tinylicious/dist/index.js"),
						"--port",
						String(port),
					]
				: [
						"127.0.0.2:0",
						resolve(certificateDirectory, "cert.pem"),
						resolve(certificateDirectory, "key.pem"),
						resolve(data.path, "data"),
					]),
		],
		{
			cwd: data.path,
			env: {
				...process.env,
				db__inMemory: "true",
				SEA_PROTOCOL: "sea",
				SEA_STORAGE_MODE: config.storage,
				SEA_EXPERIMENTAL_LIVE_CACHE: "true",
				SEA_MAX_CONNECTIONS: String(config.maxConnections),
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let startupError;
	child.on("error", (error) => {
		startupError = error;
	});
	child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
	child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
	const service = { child, data, port, logs, tinylicious };
	services.push(service);
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (startupError) throw startupError;
		if (child.exitCode !== null) throw new Error(logs.join(""));
		if (tinylicious) {
			try {
				await fetch(`http://127.0.0.2:${port}`, { signal: AbortSignal.timeout(250) });
				return service;
			} catch (error) {
				if (!(error instanceof TypeError) && error.name !== "TimeoutError") throw error;
			}
		} else {
			const url = logs.join("").match(/^WEBTRANSPORT_URL=(.+)$/mu)?.[1];
			if (url) {
				service.url = url;
				service.certificateHash = readFileSync(
					resolve(certificateDirectory, "cert.sha256"),
					"utf8",
				).trim();
				return service;
			}
		}
		await delay(100);
	}
	throw new Error(`Service startup timed out:\n${logs.join("")}`);
}

function resources(service) {
	const stat = readFileSync(`/proc/${service.child.pid}/stat`, "utf8")
		.split(") ")[1]
		.split(" ");
	const status = readFileSync(`/proc/${service.child.pid}/status`, "utf8");
	return {
		cpuSeconds: (Number(stat[11]) + Number(stat[12])) / clockTicks,
		rssKiB: Number(status.match(/^VmRSS:\s+(\d+)/mu)?.[1]),
		peakRssKiB: Number(status.match(/^VmHWM:\s+(\d+)/mu)?.[1]),
	};
}

function sampleProcessTree(pid, processes) {
	try {
		const fields = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ");
		processes.set(pid, {
			pid,
			cpuSeconds: (Number(fields[11]) + Number(fields[12])) / clockTicks,
		});
		const children = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim();
		for (const child of children === "" ? [] : children.split(" ").map(Number)) {
			sampleProcessTree(child, processes);
		}
	} catch (error) {
		if (error.code !== "ENOENT" && error.code !== "ESRCH") throw error;
	}
}

async function browser(service, query) {
	const child = spawn(
		"taskset",
		[
			"-c",
			clientCpus.join(","),
			process.execPath,
			resolve(packageRoot, "browser/run-headless.mjs"),
			packageRoot,
			service.url ?? "https://unused.invalid",
			service.certificateHash ?? "0".repeat(64),
			"__snapshotResult",
			"shared-tree-snapshot.html",
			new URLSearchParams({
				...query,
				prefetchItems: String(config.prefetchItems),
				prefetchBlobs: String(config.prefetchBlobs),
				compression: String(config.compression),
				blobBytes: String(config.blobBytes),
				...(service.port ? { port: String(service.port) } : {}),
			}).toString(),
		],
		{
			cwd: packageRoot,
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, BENCHMARK_BROWSER_TIMEOUT_MS: "240000" },
		},
	);
	let stdout = "";
	let stderr = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	const processes = new Map();
	const generatorSamples = [];
	let samplingError;
	const sample = () => {
		try {
			if (child.pid === undefined) return;
			sampleProcessTree(child.pid, processes);
			generatorSamples.push({ at: Date.now(), processes: [...processes.values()] });
		} catch (error) {
			samplingError = error;
		}
	};
	const timer = query.action === "capacity" ? setInterval(sample, 500) : undefined;
	let status;
	try {
		status = await new Promise((resolve, reject) => {
			child.once("error", reject);
			child.once("close", resolve);
		});
	} finally {
		clearInterval(timer);
	}
	if (samplingError !== undefined) throw samplingError;
	const evidence = stdout.match(/^BROWSER_EVIDENCE=(.*)$/mu)?.[1];
	if (!evidence) throw new Error(`Browser failed:\n${stdout}\n${stderr}`);
	const result = JSON.parse(evidence);
	if (query.action === "capacity") result.generatorSamples = generatorSamples;
	if (status !== 0 && result.status === "passed") throw new Error("Browser teardown failed");
	return result;
}

try {
	const sea = config.cases.some((name) => name !== "tinylicious")
		? await startService(false)
		: undefined;
	const tiny = config.cases.includes("tinylicious") ? await startService(true) : undefined;
	manifest.services = services.map((service) => ({
		backend: service.tinylicious ? "tinylicious" : "sea",
		data: service.data.provenance,
		pid: service.child.pid,
	}));
	for (const rtt of new Set([0, ...config.rtts])) {
		setRtt(rtt);
		const probe = distribution(await probeRtt());
		assert.ok(probe.p50 >= Math.max(0, rtt - 5) && probe.p50 < rtt + 30, "RTT verification");
		const control = distribution(await probeRtt("127.0.0.1"));
		assert.ok(control.p50 < 20, "control traffic was delayed");
		manifest.network.probes.push({ rtt, probe, control });
	}
	for (const bytes of config.bytes) {
		setRtt(0);
		const documents = new Map();
		for (const backend of config.repetitions > 0 ? config.cases : []) {
			const service = backend === "tinylicious" ? tiny : sea;
			const seeded = await browser(service, { backend, bytes: String(bytes), action: "seed" });
			assert.equal(seeded.status, "passed", JSON.stringify(seeded));
			documents.set(backend, seeded.document);
			samples.push({ action: "seed", backend, bytes, result: seeded });
			save();
		}
		// Rotate backend and delay order across repetitions to reduce ordering bias.
		for (let repetition = 0; repetition < config.repetitions; repetition++) {
			const order = [
				...config.cases.slice(repetition % config.cases.length),
				...config.cases.slice(0, repetition % config.cases.length),
			];
			for (const rtt of repetition % 2 === 0 ? config.rtts : [...config.rtts].reverse()) {
				setRtt(rtt);
				for (const backend of order) {
					const service = backend === "tinylicious" ? tiny : sea;
					const before = resources(service);
					const networkBefore = networkCounters();
					const result = await browser(service, {
						action: "load",
						backend,
						bytes: String(bytes),
						document: documents.get(backend),
					});
					const after = resources(service);
					const networkAfter = networkCounters();
					samples.push({
						action: "load",
						backend,
						bytes,
						rtt,
						repetition,
						result,
						service: {
							cpuSeconds: after.cpuSeconds - before.cpuSeconds,
							rssKiB: after.rssKiB,
						},
						network: {
							bytes: networkAfter.bytes - networkBefore.bytes,
							packets: networkAfter.packets - networkBefore.packets,
							drops: networkAfter.drops - networkBefore.drops,
						},
					});
					save();
					assert.equal(result.status, "passed", JSON.stringify(result));
					assert.equal(networkAfter.drops, networkBefore.drops, "netem queue dropped packets");
					console.log(
						JSON.stringify({
							action: "load",
							backend,
							bytes,
							rtt,
							repetition,
							ms: result.milliseconds,
						}),
					);
				}
			}
		}
		setRtt(0);
		for (const backend of config.cases) {
			for (const settings of [
				...config.concurrency.map((concurrency) => ({
					concurrency,
					count: config.capacityCount,
				})),
				...config.rates.map((rate) => ({ rate, count: rate * config.rateSeconds })),
			]) {
				const service = backend === "tinylicious" ? tiny : sea;
				const seeded = await browser(service, {
					backend,
					bytes: String(bytes),
					action: "seed",
				});
				samples.push({ action: "capacity-seed", backend, bytes, ...settings, result: seeded });
				save();
				assert.equal(seeded.status, "passed", JSON.stringify(seeded));
				const before = resources(service);
				const networkBefore = networkCounters();
				const workers = Math.min(
					config.workers,
					settings.count,
					settings.concurrency ?? settings.rate,
				);
				const startAt = Date.now() + 15_000;
				const workerResults = await Promise.all(
					Array.from({ length: workers }, async (_, index) => {
						const divide = (total) =>
							Math.floor(total / workers) + (index < total % workers ? 1 : 0);
						return browser(service, {
							action: "capacity",
							workload: config.workload,
							backend,
							bytes: String(bytes),
							document: seeded.document,
							startAt: String(startAt),
							count: String(
								settings.rate === undefined
									? divide(settings.count)
									: divide(settings.rate) * config.rateSeconds,
							),
							...(settings.rate === undefined
								? { concurrency: String(divide(settings.concurrency)) }
								: { rate: String(divide(settings.rate)) }),
						});
					}),
				);
				const valid = workerResults.every((worker) => Array.isArray(worker.samples));
				const combined = workerResults.flatMap((worker) => worker.samples ?? []);
				const completed = combined.filter((sample) => sample.status === "passed").length;
				const elapsedMilliseconds = valid
					? Math.max(...workerResults.map((worker) => worker.endedAt)) -
						Math.min(...workerResults.map((worker) => worker.startedAt))
					: undefined;
				const result = {
					status: valid && completed === settings.count ? "passed" : "failed",
					completed,
					failed: settings.count - completed,
					elapsedMilliseconds,
					loadsPerSecond: valid ? (completed * 1000) / elapsedMilliseconds : null,
					workers: workerResults,
				};
				const after = resources(service);
				const networkAfter = networkCounters();
				samples.push({
					action: "capacity",
					workload: config.workload,
					backend,
					bytes,
					rtt: 0,
					...settings,
					result,
					service: { cpuSeconds: after.cpuSeconds - before.cpuSeconds, rssKiB: after.rssKiB },
					network: {
						bytes: networkAfter.bytes - networkBefore.bytes,
						packets: networkAfter.packets - networkBefore.packets,
						drops: networkAfter.drops - networkBefore.drops,
					},
				});
				save();
				assert.equal(networkAfter.drops, networkBefore.drops, "netem queue dropped packets");
				console.log(
					JSON.stringify({
						action: "capacity",
						backend,
						bytes,
						...settings,
						loadsPerSecond: result.loadsPerSecond,
						failed: result.failed,
					}),
				);
			}
		}
	}
} finally {
	for (const service of services.reverse()) {
		await stop(service.child);
		writeFileSync(
			resolve(output, `${service.tinylicious ? "tinylicious" : "sea"}.log`),
			service.logs.join(""),
		);
		service.data.remove();
	}
	manifest.finishedAt = new Date().toISOString();
	save();
}
if (samples.some((sample) => sample.result.status !== "passed")) process.exitCode = 1;
