/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { cpus, platform, release } from "node:os";
import { resolve } from "node:path";
import { setImmediate as nextTurn, setTimeout as delay } from "node:timers/promises";
import { verifyNativeBuild } from "./benchmark-artifacts.mjs";
import { createTemporaryBenchmarkData } from "./benchmark-temporary-data.mjs";

const root = resolve(import.meta.dirname, "../..");
const script = resolve(import.meta.dirname, "benchmark-summaries.mjs");

function serializeJson(value, replacer = null) {
	return `${JSON.stringify(value, replacer, "\t")}\n`;
}

/** Inventories regular files, retaining filesystem allocation separately from apparent length. */
function inventory(directory) {
	const files = [];
	const visit = (path, prefix = "") => {
		if (!existsSync(path)) return;
		let entries;
		try {
			entries = readdirSync(path, { withFileTypes: true });
		} catch (error) {
			if (error?.code === "ENOENT") return;
			throw error;
		}
		for (const entry of entries) {
			const name = `${prefix}${entry.name}`;
			if (entry.isDirectory()) visit(resolve(path, entry.name), `${name}/`);
			else if (entry.isFile()) {
				let stat;
				try {
					stat = statSync(resolve(path, entry.name));
				} catch (error) {
					if (error?.code === "ENOENT") continue;
					throw error;
				}
				files.push({ name, bytes: stat.size, allocatedBytes: stat.blocks * 512 });
			}
		}
	};
	visit(directory);
	return {
		bytes: files.reduce((sum, file) => sum + file.bytes, 0),
		allocatedBytes: files.reduce((sum, file) => sum + file.allocatedBytes, 0),
		files,
	};
}

/** Captures only backend data, excluding process logs and benchmark output. */
function disk(configuration) {
	return Object.fromEntries(
		(configuration.backend === "sea" ? ["data"] : ["tiny-db", "tiny-storage"]).map((name) => [
			name,
			inventory(
				configuration.backend === "sea"
					? resolve(configuration.serviceDataDirectory, "sea-data")
					: resolve(configuration.serviceDataDirectory, name),
			),
		]),
	);
}

/** Generates reproducible ASCII values with either low or high entropy. */
function value(configuration, index, generation = 0) {
	const length = configuration.valueBytes;
	if (configuration.entropy === "repeated")
		return `${generation}:${index}:`.padEnd(length, "x").slice(0, length);
	let content = "";
	for (let block = 0; content.length < length; block++) {
		content += createHash("sha256").update(`${generation}:${index}:${block}`).digest("hex");
	}
	return content.slice(0, length);
}

/** Counts the actual Fluid upload representation, including incremental handles. */
function summaryStats(summary) {
	const stats = {
		blobs: 0,
		trees: 0,
		handles: 0,
		blobBytes: 0,
		jsonBytes: Buffer.byteLength(JSON.stringify(summary)),
	};
	const visit = (entry) => {
		if (entry.type === 1) {
			stats.trees++;
			Object.values(entry.tree).forEach(visit);
		} else if (entry.type === 2) {
			stats.blobs++;
			stats.blobBytes +=
				typeof entry.content === "string"
					? Buffer.byteLength(entry.content)
					: entry.content.byteLength;
		} else if (entry.type === 3) stats.handles++;
	};
	visit(summary);
	return stats;
}

/** Waits for an observable condition with a bounded deadline. */
async function until(predicate, label, milliseconds = 60000) {
	const deadline = Date.now() + milliseconds;
	while (!predicate()) {
		assert(Date.now() < deadline, `Timed out: ${label}`);
		await delay(10);
	}
}

/** Loads the existing test runtime and production drivers, recording storage call boundaries. */
async function client(configuration) {
	const { Loader } = await import("../../packages/loader/container-loader/lib/index.js");
	const { ContainerRuntime } = await import(
		"../../packages/runtime/container-runtime/lib/index.js"
	);
	const { SharedMap } = await import("../../packages/dds/map/lib/index.js");
	const {
		LocalCodeLoader,
		TestFluidObjectFactory,
		createTestContainerRuntimeFactory,
		createSummarizerCore,
		summarizeNow,
	} = await import("../../packages/test/test-utils/lib/index.js");
	let driver;
	if (configuration.backend === "sea") {
		const { SeaWebSocketTestDriver } = await import(
			"../../packages/test/test-drivers/lib/seaWebSocketTestDriver.js"
		);
		driver = new SeaWebSocketTestDriver(`ws://127.0.0.1:${configuration.port}/sea/websocket`);
	} else {
		const { TinyliciousTestDriver } = await import(
			"../../packages/test/test-drivers/lib/tinyliciousTestDriver.js"
		);
		const { InsecureTinyliciousUrlResolver } = await import(
			"../../packages/drivers/tinylicious-driver/lib/insecureTinyliciousUrlResolver.js"
		);
		driver = new TinyliciousTestDriver();
		driver.createUrlResolver = () =>
			new InsecureTinyliciousUrlResolver({
				endpoint: `http://127.0.0.1:${configuration.port}`,
			});
	}
	const factory = driver.createDocumentServiceFactory();
	const uploads = [];
	const services = [];
	for (const method of ["createContainer", "createDocumentService"]) {
		const original = factory[method].bind(factory);
		factory[method] = async (...args) => {
			const service = await original(...args);
			services.push(service);
			const connect = service.connectToStorage.bind(service);
			service.connectToStorage = async () => {
				const storage = await connect();
				return new Proxy(storage, {
					get(target, property) {
						if (property === "uploadSummaryWithContext")
							return async (summary, context) => {
								const stats = summaryStats(summary);
								const start = performance.now();
								const handle = await target.uploadSummaryWithContext(summary, context);
								uploads.push({
									milliseconds: performance.now() - start,
									stats,
									context,
									handle,
								});
								return handle;
							};
						const member = target[property];
						return typeof member === "function" ? member.bind(target) : member;
					},
				});
			};
			return service;
		};
	}
	const dataStore = new TestFluidObjectFactory(
		Array.from({ length: configuration.maps }, (_, index) => [
			`map${index}`,
			SharedMap.getFactory(),
		]),
	);
	const RuntimeFactory = createTestContainerRuntimeFactory(ContainerRuntime);
	const runtime = new RuntimeFactory("benchmark", dataStore, {
		summaryOptions: {
			summaryConfigOverrides: { state: "disableHeuristics", initialSummarizerDelayMs: 0 },
		},
		compressionOptions: { minimumBatchSizeInBytes: Infinity, compressionAlgorithm: "lz4" },
		enableGroupedBatching: false,
	});
	const codeDetails = { package: "summary-benchmark", config: {} };
	const resolver = driver.createUrlResolver();
	const loader = new Loader({
		urlResolver: resolver,
		documentServiceFactory: factory,
		codeLoader: new LocalCodeLoader([[codeDetails, runtime]]),
		logger: {
			send: (event) => {
				if (event.category === "error") console.error(JSON.stringify(event));
			},
		},
		configProvider: {
			getRawConfig: (name) =>
				name === "Fluid.Container.ForceWriteConnection" ? true : undefined,
		},
	});
	return {
		loader,
		driver,
		resolver,
		factory,
		codeDetails,
		uploads,
		createSummarizerCore,
		summarizeNow,
		close: () => {
			for (const service of services) service.dispose();
			driver.dispose?.();
		},
	};
}

/** Materializes every DDS and verifies its complete contents after replay. */
async function materialize(container, configuration) {
	const object = await container.getEntryPoint();
	const maps = await Promise.all(
		Array.from({ length: configuration.maps }, (_, index) =>
			object.getSharedObject(`map${index}`),
		),
	);
	return { object, maps };
}

/** Seeds actual Fluid state, summarizes twice, and appends a known unsummarized tail. */
async function seed(configuration, api) {
	const container = await api.loader.createDetachedContainer(api.codeDetails);
	const { object, maps } = await materialize(container, configuration);
	for (const [mapIndex, map] of maps.entries()) {
		for (let entry = 0; entry < configuration.entries; entry++)
			map.set(`key${entry}`, value(configuration, mapIndex * configuration.entries + entry));
	}
	await container.attach(api.driver.createCreateNewRequest("new"));
	await until(
		() => container.connectionState === 2 && !container.isDirty,
		"attached container",
	);
	const attachedDisk = disk(configuration);
	const summarizer = await api.createSummarizerCore(container, api.loader);
	await until(
		() =>
			summarizer.container.deltaManager.lastSequenceNumber >=
			container.deltaManager.lastSequenceNumber,
		"summarizer caught up",
	);
	await api.summarizeNow(summarizer.summarizer, {
		reason: "benchmark baseline",
		fullTree: true,
	});
	const baseline = api.uploads.at(-1);
	assert.equal(baseline.stats.handles, 0);
	const baselineDisk = disk(configuration);
	maps[0].set("key0", value(configuration, 0, 1));
	await until(
		() =>
			!container.isDirty &&
			summarizer.container.deltaManager.lastSequenceNumber >=
				container.deltaManager.lastSequenceNumber,
		"summary edit sequenced",
	);
	const beforeSummaryDisk = disk(configuration);
	const started = performance.now();
	const summary = await api.summarizeNow(summarizer.summarizer, {
		reason: "benchmark update",
		fullTree: configuration.mode === "full",
	});
	const summarizeMilliseconds = performance.now() - started;
	const upload = api.uploads.at(-1);
	assert(
		configuration.mode === "full" ? upload.stats.handles === 0 : upload.stats.handles > 0,
		"summary mode must be observable in uploaded tree",
	);
	const afterSummaryDisk = disk(configuration);
	for (let index = 0; index < configuration.operations; index++) {
		object.root.set("tail", { index, payload: value(configuration, index, 2) });
		await nextTurn();
		if (index % 50 === 49) await until(() => !container.isDirty, "tail batch persisted");
	}
	await until(() => !container.isDirty, "tail persisted");
	const targetSequence = container.deltaManager.lastSequenceNumber;
	const afterOpsDisk = disk(configuration);
	const resolvedUrl = container.resolvedUrl;
	const url = await container.getAbsoluteUrl("");
	const expectedDownload = await download(configuration, api, {
		resolvedUrl,
		summaryVersion: summary.summaryVersion,
	});
	summarizer.container.close();
	container.close();
	return {
		resolvedUrl,
		url,
		targetSequence,
		summaryVersion: summary.summaryVersion,
		summaryRefSeq: summary.summaryRefSeq,
		baseline,
		upload,
		summarizeMilliseconds,
		attachedDisk,
		baselineDisk,
		beforeSummaryDisk,
		afterSummaryDisk,
		afterOpsDisk,
		expectedDownload,
	};
}

/** Fetches the acknowledged snapshot and every unique blob with a fixed eight-request fanout. */
async function download(configuration, api, document) {
	const started = performance.now();
	const service = await api.factory.createDocumentService(document.resolvedUrl);
	const storage = await service.connectToStorage();
	const versions = await storage.getVersions(document.summaryVersion, 1);
	assert.equal(versions[0].id, document.summaryVersion);
	const tree = await storage.getSnapshotTree(versions[0]);
	assert(tree);
	const blobs = new Set();
	const visit = (node) => {
		Object.values(node.blobs).forEach((id) => blobs.add(id));
		Object.values(node.trees).forEach(visit);
	};
	visit(tree);
	const pending = [...blobs];
	let bytes = 0;
	const hashes = [];
	await Promise.all(
		Array.from({ length: 8 }, async () => {
			while (pending.length > 0) {
				const blob = Buffer.from(await storage.readBlob(pending.pop()));
				bytes += blob.length;
				hashes.push(createHash("sha256").update(blob).digest("hex"));
			}
		}),
	);
	const result = {
		milliseconds: performance.now() - started,
		bytes,
		blobs: blobs.size,
		contentHash: createHash("sha256").update(hashes.sort().join("")).digest("hex"),
	};
	if (document.expectedDownload) {
		assert.equal(result.contentHash, document.expectedDownload.contentHash);
		assert.equal(result.bytes, document.expectedDownload.bytes);
	}
	return result;
}

/** Loads from a fresh server and client through full DDS realization and persisted-tail replay. */
async function coldLoad(configuration, api, document) {
	const started = performance.now();
	const container = await api.loader.resolve({
		url: document.url,
		headers: { loadMode: { opsBeforeReturn: "all", deltaConnection: "none" } },
	});
	const { object, maps } = await materialize(container, configuration);
	const milliseconds = performance.now() - started;
	assert(
		container.deltaManager.lastSequenceNumber >= document.targetSequence,
		"persisted tail must be replayed",
	);
	for (const [mapIndex, map] of maps.entries()) {
		assert.equal(map.size, configuration.entries);
		for (let entry = 0; entry < configuration.entries; entry++) {
			assert.equal(
				map.get(`key${entry}`),
				value(
					configuration,
					mapIndex * configuration.entries + entry,
					mapIndex === 0 && entry === 0 ? 1 : 0,
				),
			);
		}
	}
	assert.deepEqual(object.root.get("tail"), {
		index: configuration.operations - 1,
		payload: value(configuration, configuration.operations - 1, 2),
	});
	const sequence = container.deltaManager.lastSequenceNumber;
	container.close();
	const service = await api.factory.createDocumentService(document.resolvedUrl);
	const history = await service.connectToDeltaStorage();
	const stream = history.fetchMessages(
		document.summaryRefSeq + 1,
		document.targetSequence + 1,
	);
	const persisted = new Map();
	const inspect = (entry) => {
		if (entry === null || typeof entry !== "object") return;
		if (Number.isInteger(entry.index) && typeof entry.payload === "string")
			persisted.set(entry.index, entry.payload);
		else Object.values(entry).forEach(inspect);
	};
	while (true) {
		const batch = await stream.read();
		if (batch.done) break;
		for (const message of batch.value)
			inspect(
				typeof message.contents === "string" ? JSON.parse(message.contents) : message.contents,
			);
	}
	assert.equal(
		persisted.size,
		configuration.operations,
		"all operations must survive in delta storage",
	);
	for (const [index, payload] of persisted)
		assert.equal(payload, value(configuration, index, 2));
	return {
		milliseconds,
		sequence,
		verifiedValues: configuration.maps * configuration.entries,
		verifiedTail: persisted.size,
	};
}

/** Selects an unused loopback port; startup still detects bind races. */
async function freePort() {
	const server = createServer().listen(0, "127.0.0.1");
	await once(server, "listening");
	const port = server.address().port;
	await new Promise((resolveClose) => server.close(resolveClose));
	return port;
}

/** Stops an owned process, rejecting forced termination of a successful run. */
async function stop(child) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exited = once(child, "exit");
	child.kill("SIGTERM");
	const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
	const [, signal] = await exited;
	clearTimeout(timer);
	assert.notEqual(signal, "SIGKILL", "service failed to stop cleanly");
}

/** Starts an isolated persisted backend and verifies its selected storage mode. */
async function startService(configuration, phase) {
	const certificate = resolve(root, "rust-service/tests/webtransport-browser/.certs");
	const args =
		configuration.backend === "sea"
			? [
					resolve(root, "rust-service/target/release/sea-webtransport-server"),
					"127.0.0.1:0",
					`${certificate}/cert.pem`,
					`${certificate}/key.pem`,
					resolve(configuration.serviceDataDirectory, "sea-data"),
				]
			: [
					process.execPath,
					resolve(root, "server/routerlicious/packages/tinylicious/dist/index.js"),
					"--port",
					String(configuration.port),
				];
	const child = spawn("taskset", ["-c", configuration.serviceCpus, ...args], {
		cwd: configuration.output,
		env: {
			...process.env,
			NODE_ENV: "production",
			SEA_STORAGE_MODE: configuration.storage,
			SEA_WEBSOCKET_BIND: `127.0.0.1:${configuration.port}`,
			SEA_WEBSOCKET_ORIGINS: "http://localhost",
			SEA_WEBSOCKET_ORIGINLESS_LOOPBACK: "1",
			SEA_MAX_CONNECTIONS: "128",
			storage: resolve(configuration.serviceDataDirectory, "tiny-storage"),
			db__inMemory: "false",
			db__path: resolve(configuration.serviceDataDirectory, "tiny-db"),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let log = "";
	const capture = (chunk) => {
		log += chunk;
	};
	child.hasSettledSummary = (sequence) =>
		log.split("\n").some((line) => {
			if (!line.includes("Service summary success")) return false;
			try {
				const event = JSON.parse(line.slice(line.indexOf("{")));
				return (
					event.eventName === "ServiceSummary" &&
					event.successful === true &&
					JSON.parse(event.properties).sequenceNumber >= sequence
				);
			} catch {
				return false;
			}
		});
	child.stdout.on("data", capture);
	child.stderr.on("data", capture);
	child.once("exit", () =>
		writeFileSync(resolve(configuration.output, `${phase}-service.log`), log),
	);
	try {
		const deadline = Date.now() + 30000;
		while (true) {
			assert.equal(child.exitCode, null, log);
			if (configuration.backend === "sea") {
				if (log.includes("WEBSOCKET_URL=")) {
					assert.equal(log.match(/STORAGE_MODE=(\S+)/)?.[1], configuration.storage);
					break;
				}
			} else {
				try {
					await fetch(`http://127.0.0.1:${configuration.port}/`, {
						signal: AbortSignal.timeout(500),
					});
					break;
				} catch {}
			}
			assert(Date.now() < deadline, `Service startup timed out: ${log}`);
			await delay(50);
		}
		return child;
	} catch (error) {
		await stop(child);
		throw error;
	}
}

/** Executes one bounded fresh-client phase and retains its complete diagnostic output. */
async function worker(configuration, phase) {
	const child = spawn(
		"taskset",
		[
			"-c",
			configuration.clientCpus,
			process.execPath,
			script,
			"worker",
			phase,
			JSON.stringify(configuration),
		],
		{ cwd: root, stdio: ["ignore", "pipe", "pipe"] },
	);
	let log = "";
	child.stdout.on("data", (chunk) => {
		log += chunk;
	});
	child.stderr.on("data", (chunk) => {
		log += chunk;
	});
	const timer = setTimeout(() => child.kill("SIGKILL"), 180000);
	const [code, signal] = await once(child, "exit");
	clearTimeout(timer);
	writeFileSync(resolve(configuration.output, `${phase}-client.log`), log);
	assert.equal(code, 0, `${phase} failed (${signal}): ${log}`);
	return JSON.parse(readFileSync(resolve(configuration.output, `${phase}.json`), "utf8"));
}

/** Runs one sample; every download and cold load has a newly started service and client. */
async function run(configuration) {
	assert(!existsSync(configuration.output), "output directory must be new");
	mkdirSync(configuration.output, { recursive: true });
	const temporaryData = createTemporaryBenchmarkData(`${configuration.backend}-summary-data`);
	configuration.serviceDataDirectory = temporaryData.path;
	configuration.port = await freePort();
	const result = {
		configuration,
		source: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim(),
		date: new Date().toISOString(),
		machine: {
			platform: platform(),
			release: release(),
			cpu: cpus()[0].model,
			node: process.version,
			filesystem: execFileSync("stat", ["-f", "-c", "%T", temporaryData.path], {
				encoding: "utf8",
			}).trim(),
		},
		serviceData: temporaryData.provenance,
		phases: {},
	};
	writeFileSync(resolve(configuration.output, "manifest.json"), serializeJson(result));
	try {
		for (const phase of ["seed", "download", "cold"]) {
			const service = await startService(configuration, phase);
			try {
				result.phases[phase] = await worker(configuration, phase);
				if (phase === "seed" && configuration.backend === "tinylicious") {
					await until(
						() => service.hasSettledSummary(result.phases.seed.targetSequence),
						"Tinylicious disconnect summary persisted",
					);
				}
			} finally {
				await stop(service);
			}
			result.phases[phase].closedDisk = disk(configuration);
			if (configuration.backend === "tinylicious")
				assert(
					existsSync(resolve(configuration.serviceDataDirectory, "tiny-db/CURRENT")),
					"LevelDB must actually persist",
				);
			writeFileSync(resolve(configuration.output, "result.json"), serializeJson(result));
		}
	} finally {
		temporaryData.remove();
		writeFileSync(resolve(configuration.output, "manifest.json"), serializeJson(result));
	}
	console.log(
		JSON.stringify({
			output: configuration.output,
			backend: configuration.backend,
			storage: configuration.storage,
			mode: configuration.mode,
			upload: result.phases.seed.upload.milliseconds,
			download: result.phases.download.milliseconds,
			cold: result.phases.cold.milliseconds,
		}),
	);
}

/** Collects balanced repetitions, preserving failures and updating the result index after every sample. */
function campaign(options, output) {
	verifyNativeBuild(["sea-webtransport-server"]);
	assert(!existsSync(output), "campaign output must be new");
	mkdirSync(output, { recursive: true });
	const artifacts = [
		script,
		resolve(import.meta.dirname, "benchmark-temporary-data.mjs"),
		resolve(root, "rust-service/target/release/sea-webtransport-server"),
		resolve(
			root,
			"rust-service/packages/sea-typescript/generated/websocket/node/sea_wasm_bg.wasm",
		),
		resolve(
			root,
			"server/routerlicious/packages/tinylicious/dist/services/levelDbCollection.js",
		),
	];
	const manifest = {
		date: new Date().toISOString(),
		options,
		source: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
			encoding: "utf8",
		}).trim(),
		status: execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" }),
		artifacts: artifacts.map((file) => ({
			file,
			sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
		})),
	};
	writeFileSync(resolve(output, "manifest.json"), serializeJson(manifest));
	const results = [];
	for (let repetition = 0; repetition < (options.repetitions ?? 3); repetition++) {
		for (const entries of options.sizes ?? [32, 512]) {
			for (const entropy of options.entropies ?? ["hash", "repeated"]) {
				for (const mode of ["full", "incremental"]) {
					const backends = ["buffered-file", "durable-file", "leveldb"];
					for (let offset = 0; offset < backends.length; offset++) {
						const storage = backends[(offset + repetition) % backends.length];
						const configuration = {
							maps: 8,
							entries,
							valueBytes: 1024,
							operations: options.operations ?? 200,
							entropy,
							mode,
							storage,
							backend: storage === "leveldb" ? "tinylicious" : "sea",
						};
						const name = `${String(results.length).padStart(3, "0")}-${storage}-${entries}-${entropy}-${mode}`;
						const directory = resolve(output, name);
						const execution = spawnSync(
							process.execPath,
							[script, "run", JSON.stringify(configuration), directory],
							{ cwd: root, encoding: "utf8", timeout: 600000, maxBuffer: 4 * 1024 * 1024 },
						);
						mkdirSync(directory, { recursive: true });
						writeFileSync(
							resolve(directory, "runner.log"),
							`${execution.stdout ?? ""}${execution.stderr ?? ""}`,
						);
						const file = resolve(directory, "result.json");
						const result = existsSync(file)
							? JSON.parse(readFileSync(file, "utf8"))
							: { configuration };
						const serviceLog = resolve(directory, "seed-service.log");
						const checkpointErrors = existsSync(serviceLog)
							? (
									readFileSync(serviceLog, "utf8").match(
										/Error writing database checkpoint/g,
									) ?? []
								).length
							: 0;
						results.push({
							name,
							repetition,
							exitCode: execution.status,
							error: execution.error?.message,
							checkpointErrors,
							...result,
						});
						writeFileSync(resolve(output, "results.json"), serializeJson(results));
						console.log(
							JSON.stringify({
								sample: results.length,
								name,
								exitCode: execution.status,
								checkpointErrors,
								result: execution.stdout?.trim(),
								error: execution.status === 0 ? undefined : execution.stderr?.slice(-4000),
							}),
						);
						assert.equal(
							execution.status,
							0,
							`Campaign stopped on failed sample: ${directory}`,
						);
					}
				}
			}
		}
	}
}

/** Retains compact raw samples and prints median tables without duplicating every file inventory. */
function report(directory, output) {
	const results = JSON.parse(readFileSync(resolve(directory, "results.json"), "utf8"));
	assert(
		results.length > 0 &&
			results.every(
				(sample) =>
					sample.exitCode === 0 &&
					sample.phases.cold.verifiedTail === sample.configuration.operations,
			),
	);
	assert(!existsSync(output), "retained output must be new");
	mkdirSync(output, { recursive: true });
	const compact = (key, item) =>
		key === "files"
			? {
					count: item.length,
					sha256: createHash("sha256").update(JSON.stringify(item)).digest("hex"),
				}
			: item;
	writeFileSync(resolve(output, "samples.json"), serializeJson(results, compact));
	writeFileSync(
		resolve(output, "manifest.json"),
		readFileSync(resolve(directory, "manifest.json")),
	);
	const median = (values) => {
		values.sort((left, right) => left - right);
		const middle = Math.floor(values.length / 2);
		return values.length % 2 === 0
			? (values[middle - 1] + values[middle]) / 2
			: values[middle];
	};
	const groups = new Map();
	for (const sample of results) {
		const { entries, entropy, storage, mode } = sample.configuration;
		const key = `${entries}/${entropy}/${storage}/${mode}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(sample);
	}
	const total = (inventory, field = "bytes") =>
		Object.values(inventory).reduce((sum, item) => sum + item[field], 0);
	const aggregate = [];
	for (const [key, samples] of groups) {
		const metrics = {
			uploadMilliseconds: (sample) => sample.phases.seed.upload.milliseconds,
			summarizeMilliseconds: (sample) => sample.phases.seed.summarizeMilliseconds,
			downloadMilliseconds: (sample) => sample.phases.download.milliseconds,
			coldMilliseconds: (sample) => sample.phases.cold.milliseconds,
			initialBytes: (sample) => total(sample.phases.seed.attachedDisk),
			uploadBlobBytes: (sample) => sample.phases.seed.upload.stats.blobBytes,
			summaryGrowthBytes: (sample) =>
				total(sample.phases.seed.afterSummaryDisk) -
				total(sample.phases.seed.beforeSummaryDisk),
			opGrowthBytes: (sample) =>
				total(sample.phases.seed.afterOpsDisk) - total(sample.phases.seed.afterSummaryDisk),
			closedBytes: (sample) => total(sample.phases.seed.closedDisk),
			closedAllocatedBytes: (sample) => total(sample.phases.seed.closedDisk, "allocatedBytes"),
		};
		aggregate.push({
			key,
			samples: samples.length,
			metrics: Object.fromEntries(
				Object.entries(metrics).map(([name, select]) => {
					const values = samples.map(select);
					return [
						name,
						{ median: median(values), min: Math.min(...values), max: Math.max(...values) },
					];
				}),
			),
		});
	}
	writeFileSync(resolve(output, "aggregate.json"), serializeJson(aggregate));
	console.log(`Retained ${results.length} samples in ${output}`);
	for (const group of aggregate)
		console.log(
			`${group.key}: ${Object.entries(group.metrics)
				.map(([name, metric]) => `${name}=${metric.median.toFixed(2)}`)
				.join(", ")}`,
		);
}

const [command, argument, output] = process.argv.slice(2);
if (command === "worker") {
	const configuration = JSON.parse(output);
	try {
		const api = await client(configuration);
		const document =
			argument === "seed"
				? undefined
				: JSON.parse(readFileSync(resolve(configuration.output, "seed.json"), "utf8"));
		const result = await { seed, download, cold: coldLoad }[argument](
			configuration,
			api,
			document,
		);
		api.close();
		writeFileSync(resolve(configuration.output, `${argument}.json`), serializeJson(result));
		process.exit(0);
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
} else if (command === "run") {
	const configuration = {
		maps: 8,
		entries: 32,
		valueBytes: 1024,
		operations: 100,
		entropy: "hash",
		mode: "incremental",
		backend: "sea",
		storage: "buffered-file",
		serviceCpus: "2,4,6,8",
		clientCpus: "10,12",
		...JSON.parse(argument),
		output: resolve(output),
	};
	assert(["sea", "tinylicious"].includes(configuration.backend));
	assert(["full", "incremental"].includes(configuration.mode));
	assert(["hash", "repeated"].includes(configuration.entropy));
	assert(
		configuration.backend === "sea"
			? ["buffered-file", "durable-file"].includes(configuration.storage)
			: configuration.storage === "leveldb",
	);
	for (const name of ["maps", "entries", "valueBytes", "operations"])
		assert(Number.isSafeInteger(configuration[name]) && configuration[name] > 0);
	if (configuration.backend === "sea") verifyNativeBuild(["sea-webtransport-server"]);
	await run(configuration);
} else if (command === "campaign") {
	campaign(JSON.parse(argument), resolve(output));
} else if (command === "report") {
	report(resolve(argument), resolve(output));
} else {
	console.log(
		'Usage: node rust-service/scripts/benchmark-summaries.mjs run \'{"backend":"sea","storage":"buffered-file","mode":"incremental"}\' /tmp/new-summary-sample\n       node rust-service/scripts/benchmark-summaries.mjs campaign \'{"repetitions":3}\' /tmp/new-summary-campaign',
	);
}
