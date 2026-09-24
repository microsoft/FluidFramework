/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, it } from "mocha";

const browserDirectory = resolve(import.meta.dirname, "../../browser");
const helperUrl = pathToFileURL(join(browserDirectory, "chromium.mjs")).href;
const { withChromium } = await import(helperUrl);
const execute = promisify(execFile);

/** CDP operations consumed by the lifecycle regression scenarios. */
interface BrowserClient {
	/** Sends a command and waits for its response or a bounded failure. */
	send(
		method: string,
		params?: Record<string, unknown>,
	): Promise<{ result: { value: unknown } }>;
	/** Closes the connection and rejects outstanding requests. */
	close(): void;
}

describe("Chromium runner lifecycle", function () {
	this.timeout(20_000);
	let profileRoot: string;
	let browserPid: number | undefined;

	beforeEach(async () => {
		profileRoot = await mkdtemp(join(tmpdir(), "sea-browser-test-"));
		browserPid = undefined;
	});

	afterEach(async () => {
		try {
			assert.deepEqual(await readdir(profileRoot), [], "temporary files must be removed");
			const exitedPid = browserPid;
			if (exitedPid !== undefined) {
				assert.throws(() => process.kill(exitedPid, 0), { code: "ESRCH" });
			}
		} finally {
			await rm(profileRoot, { recursive: true, force: true });
		}
	});

	it("gates evaluation on the requested document's readiness", async () => {
		await execute(process.execPath, ["--test", join(browserDirectory, "chromium.test.mjs")], {
			timeout: 10_000,
		});
	});

	/** Records the Linux Chromium profile owner so cleanup proves process exit too. */
	async function captureBrowserPid(): Promise<void> {
		const profiles = await readdir(profileRoot);
		assert.equal(profiles.length, 1);
		const lock = await readlink(join(profileRoot, profiles[0] ?? "", "SingletonLock"));
		browserPid = Number(lock.slice(lock.lastIndexOf("-") + 1));
		assert.ok(Number.isSafeInteger(browserPid) && browserPid > 0);
	}

	it("returns results and removes the browser and profile", async () => {
		const result = await withChromium(
			"about:blank",
			async (client: BrowserClient) => {
				await captureBrowserPid();
				return (
					await client.send("Runtime.evaluate", { expression: "6 * 7", returnByValue: true })
				).result.value;
			},
			{ profileRoot },
		);
		assert.equal(result, 42);
	});

	it("cleans up when the scenario throws", async () => {
		await assert.rejects(
			withChromium(
				"about:blank",
				async () => {
					await captureBrowserPid();
					throw new Error("scenario failed");
				},
				{ profileRoot },
			),
			/scenario failed/,
		);
	});

	it("removes the profile when Chromium cannot start", async () => {
		await assert.rejects(
			withChromium("about:blank", () => assert.fail("unexpected scenario"), {
				profileRoot,
				executable: join(profileRoot, "missing-chromium"),
			}),
			/ENOENT/,
		);
	});

	it("times out an unanswered CDP command and cleans up", async () => {
		await assert.rejects(
			withChromium(
				"about:blank",
				async (client: BrowserClient) => {
					await captureBrowserPid();
					await client.send("Runtime.evaluate", {
						expression: "new Promise(() => {})",
						awaitPromise: true,
					});
				},
				{ profileRoot, commandTimeoutMilliseconds: 500 },
			),
			/timed out awaiting CDP Runtime.evaluate/,
		);
	});

	for (const ignoreTermination of [false, true]) {
		it(
			ignoreTermination
				? "force-kills a child that ignores SIGTERM after startup timeout"
				: "cleans up a child that never exposes CDP before startup timeout",
			async () => {
				const fixtureDirectory = await mkdtemp(join(tmpdir(), "sea-browser-stub-"));
				const executable = join(fixtureDirectory, "chromium-stub.cjs");
				const pidPath = join(fixtureDirectory, "pid");
				const signalPath = join(fixtureDirectory, "signal");
				await writeFile(
					executable,
					`#!${process.execPath}
const fs = require("node:fs");
process.on("SIGTERM", () => {
	fs.writeFileSync(${JSON.stringify(signalPath)}, "SIGTERM");
	if (!${ignoreTermination}) process.exit(0);
});
fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
setInterval(() => {}, 1000);
`,
					{ mode: 0o700 },
				);
				let watchdogFired = false;
				const watchdog = setTimeout(() => {
					watchdogFired = true;
					void readFile(pidPath, "utf8")
						.then((pid) => {
							try {
								process.kill(Number(pid), "SIGKILL");
							} catch {}
						})
						.catch(() => {});
				}, 12_000);
				try {
					await assert.rejects(
						withChromium("about:blank", () => assert.fail("unexpected scenario"), {
							executable,
							profileRoot,
							startupTimeoutMilliseconds: 500,
						}),
						/timed out waiting for Chromium CDP/,
					);
					browserPid = Number(await readFile(pidPath, "utf8"));
					assert.ok(Number.isSafeInteger(browserPid) && browserPid > 0);
					assert.equal(await readFile(signalPath, "utf8"), "SIGTERM");
					assert.equal(watchdogFired, false, "the runner must terminate its own child");
				} finally {
					clearTimeout(watchdog);
					await rm(fixtureDirectory, { recursive: true, force: true });
				}
			},
		);
	}

	it("rejects pending CDP commands when the connection closes", async () => {
		await withChromium(
			"about:blank",
			async (client: BrowserClient) => {
				await captureBrowserPid();
				const rejected = assert.rejects(
					client.send("Runtime.evaluate", {
						expression: "new Promise(() => {})",
						awaitPromise: true,
					}),
					/CDP client closed/,
				);
				client.close();
				await rejected;
			},
			{ profileRoot },
		);
	});

	it("rejects pending CDP commands when Chromium exits", async () => {
		await withChromium(
			"about:blank",
			async (client: BrowserClient) => {
				await captureBrowserPid();
				const rejected = assert.rejects(
					client.send("Runtime.evaluate", {
						expression: "new Promise(() => {})",
						awaitPromise: true,
					}),
					/CDP socket closed/,
				);
				assert.ok(browserPid !== undefined);
				process.kill(browserPid, "SIGTERM");
				await rejected;
			},
			{ profileRoot },
		);
	});

	it("the integration runner cleans up when writing a CPU profile fails", async () => {
		const pagePath = join(profileRoot, "index.html");
		await writeFile(
			pagePath,
			'<script>window.__fixtureResult = Promise.resolve({status: "passed"});</script>',
		);
		try {
			await assert.rejects(
				execute(
					process.execPath,
					[
						join(browserDirectory, "run-headless.mjs"),
						profileRoot,
						"https://unused.invalid",
						"0".repeat(64),
						"__fixtureResult",
					],
					{
						timeout: 15_000,
						env: {
							...process.env,
							TMPDIR: profileRoot,
							BENCHMARK_CPU_PROFILE_PATH: profileRoot,
						},
					},
				),
				(error: unknown) => {
					assert.ok(error instanceof Error);
					assert.match(error.message, /EISDIR/);
					assert.equal((error as NodeJS.ErrnoException).code, 1);
					return true;
				},
			);
		} finally {
			await rm(pagePath);
		}
	});
});
