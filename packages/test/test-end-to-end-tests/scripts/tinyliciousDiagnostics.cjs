/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { AsyncLocalStorage } = require("node:async_hooks");
const dns = require("node:dns");
const fs = require("node:fs");
const http = require("node:http");
const { monitorEventLoopDelay, performance, PerformanceObserver } = require("node:perf_hooks");

const gitOperations = [
	"writeBlob",
	"readBlob",
	"writeTree",
	"readTree",
	"resolveRef",
	"writeRef",
	"readCommit",
	"writeCommit",
	"walk",
];

/**
 * Installs process-local diagnostics before Tinylicious loads its HTTP and Git modules.
 * @param {object} options - Diagnostic dependencies and optional test settings.
 * @param {object} options.git - Tinylicious's own isomorphic-git module.
 * @param {string} options.tinyliciousVersion - Installed Tinylicious package version.
 * @param {(record: object) => void} [options.write] - Structured diagnostic output.
 * @param {number} [options.intervalMs] - Sampling interval in milliseconds.
 * @param {number} [options.slowMs] - Slow-operation threshold in milliseconds.
 * @returns {() => void} Removes the hooks and stops sampling.
 */
function installDiagnostics({
	git,
	tinyliciousVersion,
	write = (record) => console.log(`tinylicious-diagnostics ${JSON.stringify(record)}`),
	intervalMs = 1000,
	slowMs = 250,
}) {
	const context = new AsyncLocalStorage();
	const active = new Map();
	let nextId = 0;
	let storageDirectory;
	let gcDurationMs = 0;
	let gcCount = 0;
	let sockets = 0;
	let stopped = false;
	const restorers = [];
	const histogram = monitorEventLoopDelay({ resolution: 20 });
	histogram.enable();
	let previousCpu = process.cpuUsage();
	let previousTime = performance.now();
	let previousUtilization = performance.eventLoopUtilization();
	const probes = {};
	const agents = new Set();

	function log(event, properties) {
		if (!stopped)
			write({ event, timestamp: new Date().toISOString(), pid: process.pid, ...properties });
	}

	function begin(kind, properties) {
		const id = ++nextId;
		const operation = {
			id,
			kind,
			startedAt: new Date().toISOString(),
			start: performance.now(),
			requestId: context.getStore(),
			...properties,
		};
		active.set(id, operation);
		return operation;
	}

	function finish(operation, properties = {}) {
		if (!active.delete(operation.id)) return;
		const { start, ...details } = operation;
		const durationMs = performance.now() - start;
		if (durationMs >= slowMs || properties.failed) {
			log("operation", { ...details, durationMs, ...properties });
		}
	}

	function failure(error) {
		return { failed: true, errorCode: error?.code, errorName: error?.name };
	}

	function correlationId(value) {
		// Keep only UUID correlation IDs, not arbitrary header contents.
		return typeof value === "string" &&
			/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
			? value
			: undefined;
	}

	function patch(target, name, replacement) {
		const original = target[name];
		target[name] = replacement(original);
		restorers.push(() => {
			target[name] = original;
		});
	}

	for (const name of gitOperations) {
		patch(
			git,
			name,
			(original) =>
				async function (...args) {
					storageDirectory ??= args[0]?.dir;
					const operation = begin("git", { operation: name });
					try {
						const result = await Reflect.apply(original, this, args);
						finish(operation);
						return result;
					} catch (error) {
						finish(operation, failure(error));
						throw error;
					}
				},
		);
	}

	const observedServers = new WeakSet();
	patch(
		http.Server.prototype,
		"emit",
		(original) =>
			function (event, ...args) {
				if (!observedServers.has(this)) {
					observedServers.add(this);
					this.on("connection", (socket) => {
						sockets++;
						socket.once("close", () => {
							sockets--;
						});
					});
				}
				if (event !== "request") return Reflect.apply(original, this, [event, ...args]);
				const [request, response] = args;
				const operation = begin("inbound", {
					method: request.method,
					path: request.url.split("?")[0],
					correlationId: correlationId(request.headers["x-correlation-id"]),
				});
				operation.requestId = operation.id;
				response.once("finish", () =>
					finish(operation, {
						status: response.statusCode,
						failed: response.statusCode >= 400,
					}),
				);
				response.once("close", () =>
					finish(operation, {
						failed: !response.writableFinished,
						status: response.statusCode,
					}),
				);
				return context.run(operation.id, () =>
					Reflect.apply(original, this, [event, ...args]),
				);
			},
	);

	patch(
		http,
		"request",
		(original) =>
			function (...args) {
				const operation = begin("outbound");
				let request;
				try {
					request = Reflect.apply(original, this, args);
				} catch (error) {
					finish(operation, failure(error));
					throw error;
				}
				operation.method = request.method;
				operation.path = request.path.split("?")[0];
				operation.correlationId = correlationId(request.getHeader("x-correlation-id"));
				if (request.agent) agents.add(request.agent);
				const mark = (name) => {
					operation[name] = performance.now() - operation.start;
				};
				request.once("socket", (socket) => {
					mark("socketAssignedMs");
					operation.reusedSocket = request.reusedSocket;
					if (socket.connecting) {
						socket.once("lookup", () => mark("lookupMs"));
						socket.once("connect", () => mark("connectMs"));
					}
				});
				request.once("response", (response) => {
					mark("responseHeadersMs");
					operation.status = response.statusCode;
					response.once("end", () =>
						finish(operation, { failed: response.statusCode >= 400 }),
					);
					response.once("error", (error) => finish(operation, failure(error)));
					response.once("close", () => finish(operation, { failed: !response.complete }));
				});
				request.once("error", (error) => finish(operation, failure(error)));
				request.once("close", () => finish(operation, { failed: !request.res?.complete }));
				return request;
			},
	);

	const observer = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			gcCount++;
			gcDurationMs += entry.duration;
		}
	});
	observer.observe({ entryTypes: ["gc"] });

	function probe(name, invoke) {
		if (probes[name]?.pending) return;
		const start = performance.now();
		probes[name] = { pending: true, start };
		invoke((error) => {
			const durationMs = performance.now() - start;
			probes[name] = { pending: false, durationMs };
			if (error) log("probeError", { probe: name, ...failure(error) });
			else if (durationMs >= slowMs) log("slowProbe", { probe: name, durationMs });
		});
	}

	const timer = setInterval(() => {
		const now = performance.now();
		const elapsedMs = now - previousTime;
		const cpu = process.cpuUsage();
		const utilization = performance.eventLoopUtilization();
		const counts = {};
		const agentCounts = { activeSockets: 0, freeSockets: 0, queuedRequests: 0 };
		for (const agent of agents) {
			for (const [field, source] of [
				["activeSockets", "sockets"],
				["freeSockets", "freeSockets"],
				["queuedRequests", "requests"],
			]) {
				for (const entries of Object.values(agent[source]))
					agentCounts[field] += entries.length;
			}
		}
		const outstanding = [...active.values()];
		for (const operation of outstanding)
			counts[operation.kind] = (counts[operation.kind] ?? 0) + 1;
		log("sample", {
			elapsedMs,
			timerDelayMs: Math.max(0, elapsedMs - intervalMs),
			eventLoopMaxMs: histogram.max / 1e6,
			eventLoopUtilization: performance.eventLoopUtilization(utilization, previousUtilization)
				.utilization,
			cpuCores:
				(cpu.user - previousCpu.user + cpu.system - previousCpu.system) / (elapsedMs * 1000),
			rssBytes: process.memoryUsage().rss,
			gcCount,
			gcDurationMs,
			sockets,
			active: counts,
			agents: agentCounts,
			oldest: outstanding
				.sort((a, b) => a.start - b.start)
				.slice(0, 5)
				.map(({ start, ...details }) => ({
					...details,
					ageMs: now - start,
				})),
			probes: Object.fromEntries(
				Object.entries(probes).map(([name, value]) => [
					name,
					value.pending ? { pendingMs: now - value.start } : { durationMs: value.durationMs },
				]),
			),
		});
		previousTime = now;
		previousCpu = cpu;
		previousUtilization = utilization;
		gcCount = 0;
		gcDurationMs = 0;
		histogram.reset();
		// Probe the same filesystem as snapshots; do not queue more probes behind a stalled one.
		if (storageDirectory)
			probe("storageStat", (callback) => fs.stat(storageDirectory, callback));
		probe("localhostLookup", (callback) => dns.lookup("localhost", callback));
	}, intervalMs);
	timer.unref();
	log("enabled", {
		tinyliciousVersion,
		nodeVersion: process.version,
		workerPoolSize: process.env.UV_THREADPOOL_SIZE ?? "4 (Node default)",
		intervalMs,
		slowMs,
	});

	return () => {
		if (stopped) return;
		stopped = true;
		clearInterval(timer);
		histogram.disable();
		observer.disconnect();
		for (const restore of restorers.reverse()) restore();
		context.disable();
	};
}

module.exports = { installDiagnostics };
