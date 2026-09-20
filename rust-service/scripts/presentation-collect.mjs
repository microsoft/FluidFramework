/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const [mode, outputText, inputText] = process.argv.slice(2);
const output = resolve(outputText ?? "/tmp/sea-presentation");

/** Retains machine-readable evidence without overwriting a previous artifact. */
function save(name, value) {
	writeFileSync(resolve(output, name), `${JSON.stringify(value, null, "\t")}\n`, {
		flag: "wx",
	});
}

/** Gets a structured command result with a generous source-inventory buffer. */
function command(executable, argumentsList, cwd = root) {
	return execFileSync(executable, argumentsList, {
		cwd,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
	});
}

/** Counts tracked sources in conservative repository-owned dependency scopes. */
function sourceCounts() {
	const tracked = command("git", ["ls-files", "-z"]).split("\0").filter(Boolean);
	const cargo = JSON.parse(
		command(
			"cargo",
			["metadata", "--locked", "--no-deps", "--format-version", "1"],
			resolve(root, "rust-service"),
		),
	);
	const crates = new Map(cargo.packages.map((entry) => [entry.name, entry]));
	const seaPaths = new Set();
	const visitCrate = (name) => {
		const entry = crates.get(name);
		if (!entry || seaPaths.has(entry.manifest_path)) return;
		seaPaths.add(entry.manifest_path);
		for (const dependency of entry.dependencies)
			if (dependency.kind === null && dependency.path) visitCrate(dependency.name);
	};
	visitCrate("sea-webtransport-server");
	const manifests = new Map();
	for (const directory of readdirSync(resolve(root, "server/routerlicious/packages"))) {
		const manifest = resolve(root, "server/routerlicious/packages", directory, "package.json");
		if (existsSync(manifest)) {
			const entry = JSON.parse(readFileSync(manifest, "utf8"));
			manifests.set(entry.name, { ...entry, path: manifest });
		}
	}
	const tinyPaths = new Set();
	const visitPackage = (name) => {
		const entry = manifests.get(name);
		if (!entry || tinyPaths.has(entry.path)) return;
		tinyPaths.add(entry.path);
		for (const dependency of Object.keys(entry.dependencies ?? {})) visitPackage(dependency);
	};
	visitPackage("tinylicious");
	assert.ok(tinyPaths.size > 1, "Tinylicious dependency scope was not resolved");
	const scopes = {
		seaNativeClosure: [...seaPaths].map(
			(manifest) => `${relative(root, dirname(manifest))}/src/`,
		),
		tinyliciousWrapper: ["server/routerlicious/packages/tinylicious/src/"],
		tinyliciousServerClosure: [...tinyPaths].map(
			(manifest) => `${relative(root, dirname(manifest))}/src/`,
		),
		seaTypeScriptAdapters: [
			"rust-service/packages/sea-typescript/src/",
			"rust-service/packages/sea-driver/src/",
			"rust-service/packages/sea-tree/src/",
		],
	};
	const results = {};
	for (const [name, prefixes] of Object.entries(scopes)) {
		const files = tracked.filter(
			(file) =>
				prefixes.some((prefix) => file.startsWith(prefix)) &&
				/\.(rs|ts|js|mjs|cjs)$/.test(file) &&
				!/\.generated\.|\/packageVersion\.ts$|\/entrypoints\//.test(file),
		);
		const list = resolve(output, `${name}-files.txt`);
		writeFileSync(list, `${files.join("\n")}\n`, { flag: "wx" });
		const raw = JSON.parse(
			command("npx", [
				"--yes",
				"cloc@2.6.0",
				`--list-file=${list}`,
				"--skip-uniqueness",
				"--json",
				"--by-file",
				"--quiet",
			]),
		);
		save(`${name}-cloc.json`, raw);
		results[name] = { prefixes, files: files.length, ...raw.SUM };
	}
	save("source-summary.json", {
		commit: command("git", ["rev-parse", "HEAD"]).trim(),
		tool: "cloc 2.06 (npm cloc@2.6.0)",
		scope:
			"Tracked source files, including tests and conditional code; excludes generated entrypoints, packageVersion, dependencies and build output. Dependency scopes follow local non-dev manifest edges, not linker reachability. Rust inline tests remain included.",
		results,
	});
	console.log(JSON.stringify(results, null, 2));
}

/** Runs a recorded, alternating-order matrix while retaining failed cells. */
function sweep(cells) {
	const artifacts = [
		"rust-service/target/release/sea-webtransport-server",
		"rust-service/packages/sea-typescript/generated/websocket/node/sea_wasm_bg.wasm",
		"rust-service/scripts/presentation-stress.mjs",
		"rust-service/scripts/presentation-collect.mjs",
	];
	save("manifest.json", {
		startedAt: new Date().toISOString(),
		commit: command("git", ["rev-parse", "HEAD"]).trim(),
		status: command("git", ["status", "--porcelain"]),
		cells,
		settings: {
			SEA_MAX_CONNECTIONS: "128",
			NODE_ENV: "production",
			native: "Cargo release, websocket-stream feature",
			wasm: "Cargo release, simd128",
			wireBytes: "not measured",
		},
		artifacts: artifacts.map((file) => ({
			file,
			sha256: createHash("sha256")
				.update(readFileSync(resolve(root, file)))
				.digest("hex"),
		})),
	});
	const results = [];
	for (const [index, configuration] of cells.entries()) {
		const directory = resolve(
			output,
			`${String(index).padStart(3, "0")}-${configuration.backend}-${configuration.payloadBytes}-${configuration.documents}docs-${configuration.cores}cpu-${configuration.rate}ops`,
		);
		const execution = spawnSync(
			process.execPath,
			[
				resolve(root, "rust-service/scripts/presentation-stress.mjs"),
				"run",
				JSON.stringify(configuration),
				directory,
			],
			{
				cwd: root,
				env: { ...process.env, SEA_MAX_CONNECTIONS: "128", NODE_ENV: "production" },
				encoding: "utf8",
				timeout: 120000,
				maxBuffer: 4 * 1024 * 1024,
			},
		);
		writeFileSync(resolve(directory, "runner.log"), execution.stdout + execution.stderr);
		const file = resolve(directory, "result.json");
		const result = existsSync(file)
			? JSON.parse(readFileSync(file, "utf8"))
			: {
					status: "failed",
					configuration,
					error: execution.error?.message ?? "No result artifact",
				};
		results.push({
			directory: relative(output, directory),
			exitCode: execution.status,
			...result,
		});
		console.log(
			JSON.stringify({
				cell: index + 1,
				total: cells.length,
				...configuration,
				status: result.status,
				sustainable: result.sustainable,
				delivered: result.deliveredOperationsPerSecond,
				cpu: result.serviceCpuPercent,
				memory: result.serviceMeanRssMiB,
				error: result.error,
			}),
		);
	}
	save("results.json", results);
}

mkdirSync(output, { recursive: true });
if (mode === "source") sourceCounts();
else if (mode === "sweep") {
	const cells = [];
	for (const cores of [1, 4])
		for (const documents of [1, 32])
			for (const payloadBytes of [64, 8192])
				for (const rate of [1000, 4000, 16000]) {
					const backends =
						cells.length % 4 === 0 ? ["sea", "tinylicious"] : ["tinylicious", "sea"];
					for (const backend of backends)
						cells.push({
							backend,
							cores,
							documents,
							payloadBytes,
							rate,
							seconds: 5,
							warmupSeconds: 1,
						});
				}
	sweep(cells);
} else if (mode === "repeat") {
	const cells = [];
	for (let repetition = 0; repetition < 10; repetition++) {
		const backends = repetition % 2 === 0 ? ["sea", "tinylicious"] : ["tinylicious", "sea"];
		for (const payloadBytes of [64, 8192]) {
			for (const backend of backends)
				cells.push({
					backend,
					cores: 4,
					documents: 32,
					payloadBytes,
					rate: 500,
					seconds: 10,
					warmupSeconds: 3,
					repetition,
				});
		}
		for (const [payloadBytes, cores, rate] of [
			[64, 1, 12000],
			[64, 4, 16000],
			[8192, 1, 6000],
			[8192, 4, 8000],
		]) {
			cells.push({
				backend: "sea",
				cores,
				documents: 32,
				payloadBytes,
				rate,
				seconds: 10,
				warmupSeconds: 3,
				repetition,
			});
		}
	}
	sweep(cells);
} else if (mode === "matrix") sweep(JSON.parse(readFileSync(resolve(inputText), "utf8")));
else
	throw new Error(
		"Use source <output>, sweep <output>, repeat <output>, or matrix <output> <cells.json>",
	);
