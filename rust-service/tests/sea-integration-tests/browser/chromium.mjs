/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/** Reserves an available loopback port until the probe listener closes. */
export async function freePort() {
	const server = createServer();
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const { port } = server.address();
	await new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	return port;
}

/**
 * CDP connection with bounded requests and rejection on connection loss.
 */
export class CdpClient {
	/** Opens a socket and records browser diagnostics for the owning scenario. */
	constructor(url, timeoutMilliseconds) {
		this.nextId = 1;
		this.pending = new Map();
		this.eventWaiters = new Set();
		this.events = [];
		this.timeoutMilliseconds = timeoutMilliseconds;
		this.socket = new WebSocket(url);
		this.connected = new Promise((resolve, reject) => {
			this.rejectConnection = reject;
			this.connectionTimer = setTimeout(() => {
				this.fail(new Error("timed out opening Chromium CDP socket"));
			}, timeoutMilliseconds);
			this.socket.addEventListener(
				"open",
				() => {
					clearTimeout(this.connectionTimer);
					resolve();
				},
				{ once: true },
			);
		});
		this.socket.addEventListener("error", () =>
			this.fail(new Error("Chromium CDP socket failed")),
		);
		this.socket.addEventListener("close", () =>
			this.fail(new Error("Chromium CDP socket closed")),
		);
		this.socket.addEventListener("message", ({ data }) => {
			const message = JSON.parse(data);
			if (message.id === undefined) {
				this.events.push(message);
				for (const waiter of this.eventWaiters) {
					if (waiter.method === message.method && waiter.matches(message.params)) {
						this.eventWaiters.delete(waiter);
						clearTimeout(waiter.timer);
						waiter.resolve(message.params);
					}
				}
				return;
			}
			const pending = this.pending.get(message.id);
			if (pending !== undefined) {
				this.pending.delete(message.id);
				clearTimeout(pending.timer);
				message.error
					? pending.reject(new Error(message.error.message))
					: pending.resolve(message.result);
			}
		});
	}

	/** Waits until CDP is connected or rejects on timeout or connection failure. */
	ready() {
		return this.connected;
	}

	/** Sends one command, rejecting if the response is lost or exceeds its deadline. */
	send(method, params = {}) {
		if (this.socket.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error("Chromium CDP socket is not open"));
		}
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`timed out awaiting CDP ${method}`));
			}, this.timeoutMilliseconds);
			this.pending.set(id, { resolve, reject, timer });
			try {
				this.socket.send(JSON.stringify({ id, method, params }));
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error);
			}
		});
	}

	/** Waits for a matching event, including one already received before its command response. */
	waitForEvent(method, matches) {
		if (this.socket.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error("Chromium CDP socket is not open"));
		}
		const received = this.events.find(
			(event) => event.method === method && matches(event.params),
		);
		if (received !== undefined) return Promise.resolve(received.params);
		return new Promise((resolve, reject) => {
			const waiter = { method, matches, resolve, reject };
			waiter.timer = setTimeout(() => {
				this.eventWaiters.delete(waiter);
				reject(new Error(`timed out awaiting CDP event ${method}`));
			}, this.timeoutMilliseconds);
			this.eventWaiters.add(waiter);
		});
	}

	/** Rejects all command and event waiters without leaving timers alive. */
	fail(error) {
		clearTimeout(this.connectionTimer);
		this.rejectConnection(error);
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
		for (const waiter of this.eventWaiters) {
			clearTimeout(waiter.timer);
			waiter.reject(error);
		}
		this.eventWaiters.clear();
	}

	/** Ends the socket and rejects outstanding commands before browser teardown. */
	close() {
		this.fail(new Error("Chromium CDP client closed"));
		this.socket.close();
	}
}

/**
 * Navigates before evaluation and waits for the requested document, not the previous page context.
 * Frame and loader identities prevent unrelated or earlier readiness events from satisfying the wait.
 */
export async function navigateToPage(client, url) {
	await client.send("Page.enable");
	await client.send("Page.setLifecycleEventsEnabled", { enabled: true });
	const { frameId, loaderId, errorText } = await client.send("Page.navigate", { url });
	if (errorText !== undefined) throw new Error(`Chromium navigation failed: ${errorText}`);
	if (loaderId === undefined) throw new Error("Chromium navigation did not create a document");
	await client.waitForEvent(
		"Page.lifecycleEvent",
		(event) =>
			event.frameId === frameId &&
			event.loaderId === loaderId &&
			event.name === "DOMContentLoaded",
	);
}

/** Owns a fresh Chromium process and profile until the scenario finishes or fails. */
export async function withChromium(
	pageUrl,
	run,
	{
		executable = "chromium",
		profileRoot = tmpdir(),
		startupTimeoutMilliseconds = 30_000,
		commandTimeoutMilliseconds = 60_000,
	} = {},
) {
	const debugPort = await freePort();
	const profile = await mkdtemp(join(profileRoot, "sea-chromium-"));
	let browser;
	let closed;
	let client;
	let errors = "";
	let exitError;
	try {
		browser = spawn(
			executable,
			[
				"--headless=new",
				"--no-sandbox",
				"--disable-gpu",
				"--disable-dev-shm-usage",
				`--user-data-dir=${profile}`,
				"--remote-debugging-address=127.0.0.1",
				`--remote-debugging-port=${debugPort}`,
				pageUrl,
			],
			{ stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, TMPDIR: profile } },
		);
		closed = new Promise((resolve) => browser.once("close", resolve));
		browser.once("error", (error) => {
			exitError = error;
		});
		browser.once("exit", (code) => {
			exitError = new Error(`Chromium exited (code ${code})`);
		});
		browser.stderr.on("data", (chunk) => {
			errors += chunk;
		});
		const deadline = Date.now() + startupTimeoutMilliseconds;
		let targets;
		while (targets === undefined && Date.now() < deadline) {
			if (exitError !== undefined) throw exitError;
			try {
				const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, {
					signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
				});
				if (response.ok) targets = await response.json();
			} catch {}
			if (targets === undefined) await delay(100);
		}
		if (targets === undefined) throw new Error("timed out waiting for Chromium CDP");
		const page = targets.find((target) => target.type === "page");
		if (page === undefined) throw new Error("Chromium did not expose a page target");
		client = new CdpClient(page.webSocketDebuggerUrl, commandTimeoutMilliseconds);
		await client.ready();
		return await run(client);
	} catch (error) {
		throw new Error(`${error.message ?? error}\n${errors}`, { cause: error });
	} finally {
		try {
			client?.close();
		} finally {
			try {
				if (browser !== undefined && browser.pid !== undefined && exitError === undefined) {
					browser.kill("SIGTERM");
					const forceKill = setTimeout(() => browser.kill("SIGKILL"), 5_000);
					try {
						await closed;
					} finally {
						clearTimeout(forceKill);
					}
				} else {
					await closed;
				}
			} finally {
				await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
			}
		}
	}
}
