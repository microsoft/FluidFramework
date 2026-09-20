/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, release, totalmem } from "node:os";
import { resolve } from "node:path";

/** Reads optional machine metadata without making unavailable fields fatal. */
function optionalRead(path) {
	try {
		return readFileSync(path, "utf8").trim();
	} catch {
		return "unknown";
	}
}

/** Runs a metadata command without inheriting potentially interactive input. */
function metadata(command, argumentsList) {
	try {
		return execFileSync(command, argumentsList, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			maxBuffer: 16 * 1024 * 1024,
		}).trim();
	} catch {
		return "unknown";
	}
}

const [outputDirectory, command, ...argumentsList] = process.argv.slice(2);
if (outputDirectory === "--help") {
	console.log("node presentation-run.mjs <new-output-directory> <command> [arguments...]");
} else {
	if (!outputDirectory || !command) {
		throw new Error("Expected an output directory and command; see --help");
	}
	const output = resolve(outputDirectory);
	mkdirSync(output, { recursive: true });
	const recordPath = resolve(output, "run.json");
	const recordDescriptor = openSync(recordPath, "wx");
	const record = {
		schemaVersion: 1,
		startedAt: new Date().toISOString(),
		cwd: process.cwd(),
		command: [command, ...argumentsList],
		commit: metadata("git", ["rev-parse", "HEAD"]),
		branch: metadata("git", ["branch", "--show-current"]),
		status: metadata("git", ["status", "--porcelain", "--untracked-files=normal"]),
		environment: {
			cpu: cpus()[0]?.model ?? "unknown",
			logicalCpus: cpus().length,
			memoryBytes: totalmem(),
			kernel: release(),
			node: process.version,
			rust: metadata("rustc", ["--version"]),
			browser: metadata("chromium", ["--version"]),
			os: optionalRead("/etc/os-release"),
			cpuQuota: optionalRead("/sys/fs/cgroup/cpu.max"),
			memoryLimit: optionalRead("/sys/fs/cgroup/memory.max"),
			cpuTopology: metadata("lscpu", ["-p=CPU,CORE"]),
			filesystem: metadata("findmnt", ["-T", process.cwd(), "-o", "FSTYPE,SOURCE,OPTIONS"]),
		},
	};
	writeFileSync(recordDescriptor, `${JSON.stringify(record, null, "\t")}\n`);
	closeSync(recordDescriptor);
	writeFileSync(resolve(output, "tracked.patch"), metadata("git", ["diff", "HEAD"]));
	const logDescriptor = openSync(resolve(output, "command.log"), "wx");
	const started = performance.now();
	const execution = spawnSync(command, argumentsList, {
		stdio: ["ignore", logDescriptor, logDescriptor],
		timeout: 30 * 60 * 1000,
		killSignal: "SIGTERM",
	});
	closeSync(logDescriptor);
	Object.assign(record, {
		finishedAt: new Date().toISOString(),
		elapsedSeconds: (performance.now() - started) / 1000,
		exitCode: execution.status,
		signal: execution.signal,
		error: execution.error?.message ?? null,
	});
	writeFileSync(recordPath, `${JSON.stringify(record, null, "\t")}\n`);
	console.log(JSON.stringify({ output, ...record }, null, 2));
	process.exitCode = execution.status ?? 1;
}
