/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
	accessSync,
	constants,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { alignedMeasurement } from "./benchmark-alignment.mjs";
import { verifyNativeBuild } from "./benchmark-artifacts.mjs";
import { assertDrainIntegrity, hasPendingDrain } from "./benchmark-gates.mjs";
import { generatorLayout } from "./benchmark-generator-layout.mjs";
import { createTemporaryBenchmarkData } from "./benchmark-temporary-data.mjs";

const root = resolve(import.meta.dirname, "../..");
const script = resolve(import.meta.dirname, "benchmark-stress.mjs");

/** Samples one process, counting one fully occupied logical CPU as 100 percent. */
function processSample(pid) {
	const status = readFileSync(`/proc/${pid}/status`, "utf8");
	const stat = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ");
	return {
		cpuTicks: Number(stat[11]) + Number(stat[12]),
		rssKiB: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0),
		peakRssKiB: Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1] ?? 0),
	};
}

/** Selects a loopback port; startup still detects a bind race. */
async function freePort() {
	const server = createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const port = server.address().port;
	await new Promise((resolveClose) => server.close(resolveClose));
	return port;
}

/** Waits for an owned child event with a fixed deadline. */
function messageFrom(child, type, milliseconds = 60000) {
	return new Promise((resolveMessage, reject) => {
		const timer = setTimeout(() => finish(new Error(`Timed out: ${type}`)), milliseconds);
		const onMessage = (message) => {
			if (message.type === "error") finish(new Error(message.error));
			else if (message.type === type) finish(undefined, message);
		};
		const onExit = (code) => finish(new Error(`Worker exited ${code} before ${type}`));
		const finish = (error, value) => {
			clearTimeout(timer);
			child.off("message", onMessage);
			child.off("exit", onExit);
			error ? reject(error) : resolveMessage(value);
		};
		child.on("message", onMessage);
		child.once("exit", onExit);
	});
}

/** Terminates only a process owned by this invocation, escalating after a deadline. */
async function stop(child) {
	if (!child || child.exitCode !== null || child.signalCode !== null) return;
	const exited = once(child, "exit");
	child.kill("SIGTERM");
	const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
	await exited;
	clearTimeout(timer);
}

/** Opens two minimal sessions using existing production clients, without a Fluid runtime. */
async function openPair(configuration, received, failure) {
	if (configuration.backend === "sea") {
		const { openRemote } = await import("../packages/sea-typescript/lib/index.js");
		const open = (document) =>
			openRemote(
				{
					environment: "node",
					mode: "WebSocket",
					websocketUrl: configuration.endpoint,
				},
				document,
				{ session: Buffer.from(randomUUID()) },
			);
		const writer = await open(undefined);
		const observer = await open(writer.document);
		const streams = [writer, observer].map((session) => session.read());
		let closed = false;
		for (const [index, stream] of streams.entries()) {
			void (async () => {
				while (!closed) {
					const event = await stream.next();
					if (event === undefined) break;
					if (event.kind === "event" && event.eventType === "application") {
						received(index, Buffer.from(event.payload).toString("ascii"));
					}
				}
			})().catch((error) => {
				if (!closed) failure(error);
			});
		}
		return {
			submit: (_sequence, payload) => writer.submit(undefined, Buffer.from(payload)),
			close: async () => {
				closed = true;
				for (const stream of streams) stream.cancel();
				await Promise.all([writer.close(), observer.close()]);
			},
		};
	}
	const { R11sDocumentDeltaConnection } = await import(
		"../../packages/drivers/routerlicious-driver/lib/documentDeltaConnection.js"
	);
	const { SocketIOClientStatic } = await import(
		"../../packages/drivers/routerlicious-driver/lib/socketModule.js"
	);
	const { InsecureTinyliciousTokenProvider } = await import(
		"../../packages/drivers/tinylicious-driver/lib/insecureTinyliciousTokenProvider.js"
	);
	const document = randomUUID();
	const response = await fetch(`${configuration.endpoint}/documents/tinylicious`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			id: document,
			summary: { type: 1, tree: {} },
			sequenceNumber: 0,
			values: [],
		}),
		signal: AbortSignal.timeout(15000),
	});
	assert.equal(response.status, 201, await response.text());
	const token = await new InsecureTinyliciousTokenProvider().fetchOrdererToken(
		"tinylicious",
		document,
	);
	const clients = [];
	const references = [0, 0];
	const logger = {
		send() {},
		sendTelemetryEvent() {},
		sendErrorEvent() {},
		sendPerformanceEvent() {},
	};
	for (let index = 0; index < 2; index++) {
		const connection = await R11sDocumentDeltaConnection.create(
			"tinylicious",
			document,
			token.jwt,
			SocketIOClientStatic,
			{
				mode: "write",
				details: { capabilities: { interactive: true } },
				permission: [],
				user: { id: randomUUID() },
				scopes: [],
			},
			configuration.endpoint,
			logger,
		);
		const handle = (_document, messages) => {
			for (const message of messages) {
				references[index] = message.sequenceNumber;
				if (message.type === "op") received(index, message.contents);
			}
		};
		connection.on("op", handle);
		connection.on("signal", () => {});
		connection.on("error", failure);
		connection.on("disconnect", failure);
		connection.on("nack", (_document, nacks) => failure(new Error(JSON.stringify(nacks))));
		handle(document, connection.initialMessages);
		void connection.initialSignals;
		clients.push(connection);
	}
	return {
		submit: (sequence, payload) => {
			clients[0].submit([
				{
					clientSequenceNumber: sequence,
					referenceSequenceNumber: references[0],
					type: "op",
					contents: payload,
					traces: [],
				},
			]);
		},
		close: async () => {
			for (const client of clients) client.dispose();
		},
	};
}

/** Generates a paced workload and verifies exact payload and per-document ordering at both recipients. */
async function worker(configuration) {
	const errors = [];
	let closing = false;
	const failure = (error) => {
		if (!closing && errors.length < 10) errors.push(String(error));
	};
	const suffix = "x".repeat(configuration.payloadBytes - 8);
	const documents = [];
	const latencies = [];
	let measuredSent = 0;
	let deliveredInWindow = 0;
	let start;
	let end;
	for (let index = 0; index < configuration.documents; index++) {
		const state = {
			sent: 0,
			observed: [0, 0],
			times: [0],
			measured: [false],
			acknowledgments: 0,
		};
		state.pair = await openPair(
			configuration,
			(recipient, payload) => {
				try {
					const sequence = Number(payload.slice(0, 8));
					assert.equal(
						sequence,
						state.observed[recipient] + 1,
						"duplicate, missing, or reordered operation",
					);
					assert.equal(
						payload,
						String(sequence).padStart(8, "0") + suffix,
						"payload corruption",
					);
					state.observed[recipient] = sequence;
					if (recipient === 1 && state.measured[sequence]) {
						const now = performance.now();
						latencies.push(now - state.times[sequence]);
						if (now < end) deliveredInWindow++;
					}
				} catch (error) {
					failure(error);
				}
			},
			failure,
		);
		documents.push(state);
	}
	process.send({ type: "ready" });
	await new Promise((resolveStart) => process.once("message", resolveStart));
	start = performance.now();
	end = start + (configuration.warmupSeconds + configuration.seconds) * 1000;
	const warmEnd = start + configuration.warmupSeconds * 1000;
	let sent = 0;
	let maxPending = 0;
	let maxScheduleLag = 0;
	const cpuStart = process.cpuUsage();
	const backlog = [];
	let lastSample = start;
	while (performance.now() < end && errors.length === 0) {
		const now = performance.now();
		const target = Math.floor(((now - start) / 1000) * configuration.rate);
		maxScheduleLag = Math.max(maxScheduleLag, ((target - sent) / configuration.rate) * 1000);
		const pending = documents.reduce(
			(sum, document) => sum + document.sent - document.observed[1],
			0,
		);
		maxPending = Math.max(maxPending, pending);
		if (pending > 8192 || sent >= 1000000) {
			failure("bounded backlog or operation limit reached");
			break;
		}
		for (let count = 0; sent < target && count < 512; count++) {
			const document = documents[sent % documents.length];
			const sequence = ++document.sent;
			const timestamp = performance.now();
			document.times.push(timestamp);
			document.measured.push(timestamp >= warmEnd);
			if (timestamp >= warmEnd) measuredSent++;
			try {
				const result = document.pair.submit(
					sequence,
					String(sequence).padStart(8, "0") + suffix,
				);
				if (result)
					void result.then(() => {
						document.acknowledgments++;
					}, failure);
			} catch (error) {
				failure(error);
			}
			sent++;
		}
		if (now - lastSample >= 250) {
			backlog.push({ seconds: (now - start) / 1000, pending, sent });
			lastSample = now;
		}
		await delay(5);
	}
	const pendingAtEnd = documents.reduce(
		(sum, document) => sum + document.sent - document.observed[1],
		0,
	);
	const drainDeadline = performance.now() + 10000;
	while (
		errors.length === 0 &&
		performance.now() < drainDeadline &&
		hasPendingDrain(documents, configuration.backend)
	)
		await delay(10);
	const missing = documents.reduce(
		(sum, document) =>
			sum + document.observed.reduce((total, count) => total + document.sent - count, 0),
		0,
	);
	const cpu = process.cpuUsage(cpuStart);
	latencies.sort((left, right) => left - right);
	const percentile = (fraction) =>
		latencies[Math.max(0, Math.ceil(latencies.length * fraction) - 1)] ?? null;
	const result = {
		type: "result",
		sent,
		measuredSent,
		deliveredInWindow,
		missing,
		errors,
		pendingAtEnd,
		maxPending,
		maxScheduleLagMilliseconds: maxScheduleLag,
		latencyMilliseconds: {
			median: percentile(0.5),
			p95: percentile(0.95),
			max: latencies.at(-1) ?? null,
		},
		generatorCpuSeconds: (cpu.user + cpu.system) / 1000000,
		generatorPeakRssKiB: process.resourceUsage().maxRSS,
		acknowledged:
			configuration.backend === "sea"
				? documents.reduce((sum, document) => sum + document.acknowledgments, 0)
				: null,
		backlog,
	};
	closing = true;
	await Promise.race([
		Promise.all(documents.map((document) => document.pair.close())),
		delay(2000),
	]);
	process.send(result);
	process.disconnect();
	process.exit(0);
}

/** Runs one isolated service sample and captures resource curves from owned processes. */
async function run(configuration, output) {
	if (configuration.backend === "sea") {
		verifyNativeBuild([
			...(configuration.serverBinary === undefined ? ["sea-webtransport-server"] : []),
			...(configuration.generator === "native" && configuration.generatorBinary === undefined
				? ["presentation-native"]
				: []),
		]);
	}
	mkdirSync(output, { recursive: true });
	const temporaryData = createTemporaryBenchmarkData(`${configuration.backend}-stress-data`);
	const serverBinary = resolve(
		configuration.serverBinary ??
			resolve(root, "rust-service/target/release/sea-webtransport-server"),
	);
	const generatorBinary = resolve(
		configuration.generatorBinary ??
			resolve(root, "rust-service/target/release/presentation-native"),
	);
	if (configuration.backend === "sea") {
		assert.ok(statSync(serverBinary).isFile(), "serverBinary must be a regular file");
		accessSync(serverBinary, constants.X_OK);
		if (configuration.generator === "native") {
			assert.ok(statSync(generatorBinary).isFile(), "generatorBinary must be a regular file");
			accessSync(generatorBinary, constants.X_OK);
		}
	}
	const port = await freePort();
	const serviceCpu = { 1: "2", 4: "2,4,6,8", 8: "0,2,4,6,8,10,12,14" }[configuration.cores];
	const certificate = resolve(root, "rust-service/tests/webtransport-browser/.certs");
	const argumentsList =
		configuration.backend === "sea"
			? [
					serverBinary,
					"127.0.0.1:0",
					`${certificate}/cert.pem`,
					`${certificate}/key.pem`,
					resolve(temporaryData.path, "sea-data"),
				]
			: [
					process.execPath,
					resolve(root, "server/routerlicious/packages/tinylicious/dist/index.js"),
					"--port",
					String(port),
				];
	const service = spawn("taskset", ["-c", serviceCpu, ...argumentsList], {
		cwd: output,
		env: {
			...process.env,
			NODE_ENV: "production",
			SEA_STORAGE_MODE: configuration.storage ?? "memory",
			...(configuration.liveCache === undefined
				? {}
				: { SEA_EXPERIMENTAL_LIVE_CACHE: String(configuration.liveCache) }),
			SEA_WEBSOCKET_BIND: `127.0.0.1:${port}`,
			SEA_WEBSOCKET_ORIGINS: "http://localhost",
			SEA_WEBSOCKET_ORIGINLESS_LOOPBACK: "1",
			storage: resolve(temporaryData.path, "tiny-storage"),
			db__inMemory: String(configuration.storage !== "leveldb"),
			db__path: resolve(temporaryData.path, "tiny-db"),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let serviceLog = "";
	const capture = (chunk) => {
		if (serviceLog.length < 2000000) serviceLog += chunk;
	};
	service.stdout.on("data", capture);
	service.stderr.on("data", capture);
	const workers = [];
	let sampleTimer;
	const samples = [];
	const anchorMonotonic = performance.now();
	const anchorEpochMicros = Date.now() * 1000;
	const epochMicros = () =>
		Math.round(anchorEpochMicros + (performance.now() - anchorMonotonic) * 1000);
	let started = performance.now();
	let workloadStarted = false;
	let guardFailure;
	const failGuard = (message) => {
		guardFailure ??= message;
		for (const child of [...workers, service]) child.kill("SIGTERM");
	};
	const outerTimer = setTimeout(() => failGuard("120 s wall-clock guard"), 120_000);
	const captureSample = () => {
		try {
			const before = epochMicros();
			const usage = processSample(service.pid);
			const after = epochMicros();
			const sample = {
				seconds: (performance.now() - started) / 1000,
				workloadStarted,
				epochBeforeMicros: before,
				epochAfterMicros: after,
				clockDiscrepancyMicros: Math.abs(Date.now() * 1000 - epochMicros()),
				service: usage,
			};
			samples.push(sample);
			if (usage.rssKiB > 4 * 1024 * 1024) failGuard("4 GiB sampled RSS guard");
			if (sample.clockDiscrepancyMicros > 2000) failGuard("host clock jump exceeds 2 ms");
		} catch (error) {
			failGuard(`resource sampling failed: ${error}`);
		}
	};
	const clockTicks = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }));
	let result;
	let workerResults;
	try {
		captureSample();
		sampleTimer = setInterval(captureSample, 250);
		const deadline = Date.now() + 30000;
		while (true) {
			if (service.exitCode !== null) throw new Error(`Service exited: ${serviceLog}`);
			try {
				if (configuration.backend === "sea") {
					if (serviceLog.includes("WEBSOCKET_URL=")) break;
				} else {
					await fetch(`http://127.0.0.1:${port}/`, {
						signal: AbortSignal.timeout(500),
					});
					break;
				}
			} catch {}
			if (Date.now() > deadline) throw new Error(`Startup timeout: ${serviceLog}`);
			await delay(50);
		}
		if (configuration.backend === "sea")
			assert.equal(
				serviceLog.match(/STORAGE_MODE=(\S+)/)?.[1],
				configuration.storage ?? "memory",
			);
		if (configuration.backend === "sea") {
			const liveCache = configuration.liveCache ?? true;
			assert.equal(
				serviceLog.includes("EXPERIMENTAL_LIVE_CACHE=true"),
				liveCache,
				"cache activation marker",
			);
		}
		const generators = generatorLayout(configuration);
		const ready = [];
		for (let index = 0; index < generators.count; index++) {
			const workerConfiguration = {
				...configuration,
				generatorProcesses: undefined,
				documents: configuration.documents / generators.count,
				rate: configuration.rate / generators.count,
				endpoint:
					configuration.backend === "sea"
						? configuration.transport === "webtransport"
							? serviceLog.match(/WEBTRANSPORT_URL=(\S+)/)?.[1]
							: `ws://127.0.0.1:${port}/sea/websocket`
						: `http://127.0.0.1:${port}`,
				transport: configuration.transport ?? "websocket",
				certificateHash: serviceLog.match(/CERTIFICATE_SHA256=(\S+)/)?.[1] ?? "",
			};
			const native = configuration.generator === "native";
			const child = spawn(
				"taskset",
				[
					"-c",
					String(generators.cpus[index]),
					...(native ? [generatorBinary] : [process.execPath, script, "worker"]),
					JSON.stringify(workerConfiguration),
				],
				{
					stdio: native ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe", "ipc"],
				},
			);
			if (native) {
				const lines = createInterface({ input: child.stdout });
				lines.on("line", (line) => {
					try {
						const message = JSON.parse(line);
						if (message.type === "result") {
							const usage = processSample(child.pid);
							message.generatorCpuSeconds =
								(usage.cpuTicks - child.initialCpuTicks) / clockTicks;
							message.generatorPeakRssKiB = usage.peakRssKiB;
						}
						child.emit("message", message);
					} catch (error) {
						child.emit("message", { type: "error", error: String(error) });
					}
				});
			} else child.stdout.on("data", capture);
			child.stderr.on("data", capture);
			workers.push(child);
			ready.push(messageFrom(child, "ready"));
		}
		await Promise.all(ready);
		if (configuration.backend === "tinylicious")
			assert.equal(
				existsSync(resolve(temporaryData.path, "tiny-db", "CURRENT")),
				configuration.storage === "leveldb",
				"Tinylicious database selection must match its on-disk LevelDB marker",
			);
		started = performance.now();
		workloadStarted = true;
		captureSample();
		const promises = workers.map((child) =>
			messageFrom(
				child,
				"result",
				(configuration.seconds + configuration.warmupSeconds + 30) * 1000,
			),
		);
		for (const child of workers) {
			if (configuration.generator === "native") {
				child.initialCpuTicks = processSample(child.pid).cpuTicks;
				child.stdin.write("start\n");
			} else child.send({ type: "start" });
		}
		const results = await Promise.all(promises);
		workerResults = results;
		captureSample();
		assert.equal(guardFailure, undefined);
		assertDrainIntegrity(results, configuration.backend);
		const measured = samples.filter(
			(sample) =>
				sample.workloadStarted &&
				sample.seconds >= configuration.warmupSeconds &&
				sample.seconds <= configuration.seconds + configuration.warmupSeconds,
		);
		const first = measured[0];
		const last = measured.at(-1);
		const delivered = results.reduce((sum, entry) => sum + entry.deliveredInWindow, 0);
		const sent = results.reduce((sum, entry) => sum + entry.measuredSent, 0);
		result = {
			status: "completed",
			configuration,
			storage:
				configuration.backend === "sea"
					? (configuration.storage ?? "memory")
					: configuration.storage === "leveldb"
						? "leveldb"
						: "default-in-memory-database",
			liveCache: configuration.backend === "sea" ? (configuration.liveCache ?? true) : null,
			transport:
				configuration.backend === "sea"
					? (configuration.transport ?? "websocket")
					: "socket.io",
			generator:
				configuration.generator ?? (configuration.backend === "sea" ? "node-wasm" : "node"),
			serviceCpu,
			generatorProcesses: generators.count,
			generatorCpus: generators.cpus.join(","),
			clockTicks,
			aligned:
				configuration.generator === "native"
					? alignedMeasurement(first, last, results, clockTicks)
					: null,
			deliveredOperationsPerSecond: delivered / configuration.seconds,
			payloadMiBPerSecond:
				(delivered * configuration.payloadBytes) / configuration.seconds / 1048576,
			serviceCpuPercent:
				first && last
					? ((last.service.cpuTicks - first.service.cpuTicks) /
							clockTicks /
							(last.seconds - first.seconds)) *
						100
					: null,
			serviceMeanRssMiB:
				measured.reduce((sum, sample) => sum + sample.service.rssKiB, 0) /
				measured.length /
				1024,
			servicePeakRssMiB:
				Math.max(...samples.map((sample) => sample.service.peakRssKiB)) / 1024,
			sustainable:
				sent >= configuration.rate * configuration.seconds * 0.98 &&
				delivered >= configuration.rate * configuration.seconds * 0.98 &&
				results.every(
					(entry) =>
						entry.errors.length === 0 &&
						entry.missing === 0 &&
						entry.latencyMilliseconds.p95 !== null &&
						entry.latencyMilliseconds.p95 <= 100 &&
						entry.maxScheduleLagMilliseconds <= 100,
				),
			workers: results,
			resourceSamples: samples,
			serviceData: temporaryData.provenance,
		};
	} catch (error) {
		result = {
			status: "failed",
			configuration,
			error: String(error),
			guardFailure,
			liveCache: configuration.backend === "sea" ? (configuration.liveCache ?? true) : null,
			workers: workerResults,
			resourceSamples: samples,
			serviceData: temporaryData.provenance,
		};
	} finally {
		clearInterval(sampleTimer);
		clearTimeout(outerTimer);
		await Promise.all(workers.map(stop));
		await stop(service);
		try {
			temporaryData.remove();
		} catch (error) {
			result = {
				...result,
				status: "failed",
				temporaryDataCleanupError: String(error),
			};
		}
		writeFileSync(resolve(output, "service.log"), serviceLog);
		writeFileSync(resolve(output, "result.json"), `${JSON.stringify(result, null, "\t")}\n`);
	}
	console.log(
		JSON.stringify({
			output,
			...result,
			workers: undefined,
			resourceSamples: undefined,
		}),
	);
	if (result.status === "failed") process.exitCode = 1;
}

const [mode, configurationText, outputDirectory] = process.argv.slice(2);
if (mode === "--help") {
	console.log(
		'node benchmark-stress.mjs run \'{"backend":"sea","rate":100,"payloadBytes":64,"documents":1,"cores":1,"seconds":5,"warmupSeconds":1}\' <output>',
	);
} else {
	const configuration = JSON.parse(configurationText);
	assert.ok(["sea", "tinylicious"].includes(configuration.backend));
	assert.ok([1, 4, 8].includes(configuration.cores));
	assert.ok(
		configuration.storage === undefined ||
			(configuration.backend === "sea" &&
				["memory", "buffered-file", "durable-file"].includes(configuration.storage)) ||
			(configuration.backend === "tinylicious" &&
				["memory", "leveldb"].includes(configuration.storage)),
	);
	assert.ok(
		Number.isInteger(configuration.documents) &&
			configuration.documents >= 1 &&
			configuration.documents <= 32,
	);
	assert.ok(Number.isFinite(configuration.rate) && configuration.rate > 0, "rate");
	if (mode !== "worker") assert.ok(Number.isInteger(configuration.rate), "total rate");
	for (const key of ["payloadBytes", "seconds", "warmupSeconds"])
		assert.ok(Number.isInteger(configuration[key]) && configuration[key] > 0, key);
	assert.ok(configuration.payloadBytes >= 8 && configuration.payloadBytes <= 8192);
	if (mode !== "worker") generatorLayout(configuration);
	assert.ok(
		configuration.generator === undefined ||
			(configuration.generator === "native" && configuration.backend === "sea"),
	);
	assert.ok(
		configuration.transport === undefined ||
			["websocket", "webtransport"].includes(configuration.transport),
	);
	assert.ok(
		configuration.transport !== "webtransport" || configuration.generator === "native",
	);
	if (mode === "worker") {
		await worker(configuration).catch((error) => {
			process.send({ type: "error", error: String(error) });
			process.exit(1);
		});
	} else {
		assert.equal(mode, "run");
		await run(configuration, resolve(outputDirectory));
	}
}
