/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createSocket } from "node:dgram";
import { readlinkSync } from "node:fs";
import { connect, createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

/** Refuses to modify the caller's network namespace. */
export function initializeNetwork(parentNamespace) {
	assert.notEqual(readlinkSync("/proc/self/ns/net"), parentNamespace);
	assert.match(parentNamespace, /^net:\[\d+\]$/u);
	execFileSync("ip", ["link", "set", "lo", "up"]);
	// Only service traffic uses 127.0.0.2. CDP, page assets, and Tinylicious's
	// internal localhost HTTP remain unshaped on 127.0.0.1.
	tc([
		"qdisc",
		"add",
		"dev",
		"lo",
		"root",
		"handle",
		"1:",
		"prio",
		"bands",
		"3",
		"priomap",
		...Array(16).fill("0"),
	]);
	tc([
		"qdisc",
		"add",
		"dev",
		"lo",
		"parent",
		"1:3",
		"handle",
		"30:",
		"netem",
		"limit",
		"100000",
	]);
	for (const direction of ["src", "dst"]) {
		tc([
			"filter",
			"add",
			"dev",
			"lo",
			"protocol",
			"ip",
			"parent",
			"1:",
			"prio",
			"1",
			"u32",
			"match",
			"ip",
			direction,
			"127.0.0.2/32",
			"flowid",
			"1:3",
		]);
	}
}

function tc(args) {
	return execFileSync("tc", args, { encoding: "utf8" });
}

let tcpServicePort;

/** Shapes only the current WebSocket listener port on the allowed 127.0.0.1 endpoint. */
export function setTcpServicePort(port) {
	assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
	if (tcpServicePort !== undefined) {
		for (const priority of ["2", "3"])
			tc(["filter", "del", "dev", "lo", "parent", "1:", "protocol", "ip", "prio", priority]);
	}
	for (const [direction, priority] of [
		["sport", "2"],
		["dport", "3"],
	]) {
		tc([
			"filter",
			"add",
			"dev",
			"lo",
			"protocol",
			"ip",
			"parent",
			"1:",
			"prio",
			priority,
			"u32",
			"match",
			"ip",
			"protocol",
			"6",
			"0xff",
			"match",
			"ip",
			direction,
			String(port),
			"0xffff",
			"flowid",
			"1:3",
		]);
	}
	tcpServicePort = port;
}

/** Verifies the TCP port filter separately from connection establishment, then restores it. */
export async function probeTcpRtt(count = 7) {
	const previous = tcpServicePort;
	assert.ok(previous !== undefined);
	const server = createServer((socket) => socket.on("data", (bytes) => socket.write(bytes)));
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const port = server.address().port;
	setTcpServicePort(port);
	const socket = connect(port, "127.0.0.1");
	try {
		await new Promise((resolve, reject) => {
			socket.once("connect", resolve);
			socket.once("error", reject);
		});
		socket.setNoDelay(true);
		const samples = [];
		for (let index = 0; index < count; index++) {
			const start = performance.now();
			await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error("TCP RTT probe timed out")), 5000);
				socket.once("data", () => {
					clearTimeout(timeout);
					resolve();
				});
				socket.write(Buffer.from([index]));
			});
			samples.push(performance.now() - start);
		}
		return samples;
	} finally {
		socket.destroy();
		await new Promise((resolve) => server.close(resolve));
		setTcpServicePort(previous);
	}
}

export function setRtt(milliseconds) {
	assert.ok(Number.isFinite(milliseconds) && milliseconds >= 0);
	tc([
		"qdisc",
		"change",
		"dev",
		"lo",
		"parent",
		"1:3",
		"handle",
		"30:",
		"netem",
		"limit",
		"100000",
		"delay",
		`${milliseconds / 2}ms`,
	]);
}

export function networkCounters() {
	const entry = JSON.parse(tc(["-s", "-j", "qdisc", "show", "dev", "lo"])).find(
		(item) => item.handle === "30:",
	);
	assert.ok(entry, "missing benchmark netem queue");
	return entry;
}

/** Measures packet RTT, without folding a TCP connection handshake into the result. */
export async function probeRtt(address = "127.0.0.2", count = 7) {
	const server = createSocket("udp4");
	const client = createSocket("udp4");
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.bind(0, address, resolve);
	});
	server.on("message", (message, peer) => server.send(message, peer.port, peer.address));
	try {
		await new Promise((resolve, reject) => {
			client.once("error", reject);
			client.bind(0, "127.0.0.1", resolve);
		});
		const samples = [];
		for (let index = 0; index < count; index++) {
			const start = performance.now();
			await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error("RTT probe timed out")), 5000);
				client.once("message", () => {
					clearTimeout(timeout);
					resolve();
				});
				client.send(Buffer.from([index]), server.address().port, address);
			});
			samples.push(performance.now() - start);
			await delay(5);
		}
		return samples;
	} finally {
		client.close();
		server.close();
	}
}

export function distribution(values) {
	assert.ok(values.length > 0 && values.every(Number.isFinite));
	const sorted = [...values].sort((a, b) => a - b);
	const percentile = (fraction) =>
		sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
	return {
		count: sorted.length,
		min: sorted[0],
		p50: percentile(0.5),
		p95: percentile(0.95),
		p99: percentile(0.99),
		max: sorted.at(-1),
		mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
	};
}
