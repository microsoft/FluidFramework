/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Stops an owned process, escalating when graceful shutdown does not finish. */
async function stopProcess(child, exited, processGroup = false) {
	if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
		return;
	}
	const kill = (signal) => {
		try {
			if (processGroup) process.kill(-child.pid, signal);
			else child.kill(signal);
		} catch (error) {
			if (error.code !== "ESRCH") throw error;
		}
	};
	kill("SIGTERM");
	const timeout = setTimeout(() => kill("SIGKILL"), 5_000);
	try {
		await exited;
	} finally {
		clearTimeout(timeout);
	}
}

/** Runs a command with bounded execution and propagates its failure. */
async function runCommand(command, args, options, timeoutMilliseconds) {
	const child = spawn(command, args, { ...options, stdio: "inherit", detached: true });
	const exited = new Promise((resolve) => child.once("close", resolve));
	let timeout;
	let interrupted;
	try {
		await Promise.race([
			new Promise((_, reject) => {
				interrupted = () => reject(new Error(`${command} interrupted`));
				process.once("SIGINT", interrupted);
				process.once("SIGTERM", interrupted);
			}),
			new Promise((resolve, reject) => {
				child.once("error", reject);
				child.once("close", (code, signal) => {
					if (code === 0) resolve();
					else reject(new Error(`${command} failed: code=${code}, signal=${signal}`));
				});
			}),
			new Promise((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error(`${command} exceeded ${timeoutMilliseconds}ms`)),
					timeoutMilliseconds,
				);
			}),
		]);
	} finally {
		clearTimeout(timeout);
		process.off("SIGINT", interrupted);
		process.off("SIGTERM", interrupted);
		await stopProcess(child, exited, true);
	}
}

/** Owns a disposable service directory and process through readiness, tests, and shutdown. */
export async function withSeaServer(start, runTests, timeoutMilliseconds = 30_000) {
	const directory = await mkdtemp(path.join(tmpdir(), "fluid-sea-tests-"));
	const marker = path.join(directory, "shutdown.request");
	let child;
	let exited;
	let timeout;
	let logs = "";
	let failed = false;
	const controller = new AbortController();
	const interrupted = () => controller.abort(new Error("SEA test run interrupted"));
	process.once("SIGINT", interrupted);
	process.once("SIGTERM", interrupted);
	try {
		child = await start(directory, marker);
		exited = new Promise((resolve) => child.once("close", resolve));
		controller.signal.throwIfAborted();
		const endpoint = await new Promise((resolve, reject) => {
			controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
				once: true,
			});
			timeout = setTimeout(
				() => reject(new Error("SEA readiness timed out")),
				timeoutMilliseconds,
			);
			child.once("error", reject);
			child.once("close", (code, signal) =>
				reject(new Error(`SEA exited before readiness: code=${code}, signal=${signal}`)),
			);
			const collect = (chunk) => {
				logs = `${logs}${chunk}`.slice(-64 * 1024);
			};
			let stdout = "";
			child.stderr.on("data", collect);
			child.stdout.on("data", (chunk) => {
				collect(chunk);
				stdout = `${stdout}${chunk}`.slice(-64 * 1024);
				const match = /^WEBSOCKET_URL=([^\r\n]+)\r?\n/m.exec(stdout);
				if (match !== null) {
					try {
						const url = new URL(match[1].trim());
						if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1") {
							throw new Error("SEA tests require an unforwarded loopback WebSocket listener");
						}
						resolve(url.href);
					} catch (error) {
						reject(error);
					}
				}
			});
		});
		clearTimeout(timeout);
		await runTests(endpoint);
		controller.signal.throwIfAborted();
		await writeFile(marker, "shutdown\n");
		const code = await Promise.race([
			exited,
			new Promise((_, reject) => {
				timeout = setTimeout(() => reject(new Error("SEA shutdown timed out")), 10_000);
			}),
		]);
		if (code !== 0) throw new Error(`SEA shutdown failed: code=${code}`);
	} catch (error) {
		failed = true;
		throw error;
	} finally {
		clearTimeout(timeout);
		process.off("SIGINT", interrupted);
		process.off("SIGTERM", interrupted);
		if (child !== undefined) await stopProcess(child, exited);
		if (failed && logs.length > 0) console.error(`SEA service output:\n${logs}`);
		await rm(directory, { recursive: true, force: true });
	}
}

/** Builds and owns the native service while the explicitly selected Node suite runs. */
async function main() {
	for (const argument of process.argv.slice(2)) {
		if (
			/^--(?:driver|compatKind|compatVersion|baseVersion|config|require|node-option|parallel)(?:=|$)/u.test(
				argument,
			)
		) {
			throw new Error(
				`SEA runner owns service and version selection; unsupported override: ${argument}`,
			);
		}
	}
	const packageRoot = fileURLToPath(new URL("../", import.meta.url));
	const serviceRoot = path.resolve(packageRoot, "../../../rust-service");
	const targetRoot = path.join(serviceRoot, "target");
	await runCommand(
		"cargo",
		["build", "--locked", "-p", "sea-webtransport-server", "--features", "websocket-stream"],
		{
			cwd: serviceRoot,
			env: { ...process.env, CARGO_TARGET_DIR: targetRoot },
		},
		600_000,
	);
	const binary = path.join(targetRoot, "debug/sea-webtransport-server");
	await withSeaServer(
		async (directory, marker) => {
			const certificates = path.join(directory, "certificates");
			await runCommand(
				"sh",
				["tests/webtransport-browser/generate-cert.sh", certificates],
				{
					cwd: serviceRoot,
				},
				30_000,
			);
			return spawn(
				binary,
				[
					"127.0.0.1:0",
					path.join(certificates, "cert.pem"),
					path.join(certificates, "key.pem"),
					path.join(directory, "data"),
					marker,
				],
				{
					cwd: serviceRoot,
					env: {
						...process.env,
						SEA_STORAGE_MODE: "memory",
						SEA_WEBSOCKET_BIND: "127.0.0.1:0",
						SEA_WEBSOCKET_ORIGINS: "http://localhost",
						SEA_WEBSOCKET_ORIGINLESS_LOOPBACK: "1",
					},
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
		},
		async (endpoint) => {
			await runCommand(
				process.execPath,
				[
					fileURLToPath(import.meta.resolve("mocha/bin/mocha.js")),
					"--driver=sea-websocket",
					"--compatKind=None",
					"--compatVersion=0",
					"--timeout=10000",
					...process.argv.slice(2),
				],
				{
					cwd: packageRoot,
					env: { ...process.env, SEA_TEST_WEBSOCKET_URL: endpoint },
				},
				600_000,
			);
		},
	);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
