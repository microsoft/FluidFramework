/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readlinkSync } from "node:fs";
import { test } from "node:test";
import {
	distribution,
	initializeNetwork,
	networkCounters,
	probeRtt,
	setRtt,
} from "./snapshot-network.mjs";

if (process.argv[2] === "--child") {
	initializeNetwork(process.argv[3]);
	const baseline = distribution(await probeRtt());
	setRtt(100);
	const delayed = distribution(await probeRtt());
	const unaffected = distribution(await probeRtt("127.0.0.1"));
	assert.ok(delayed.p50 - baseline.p50 >= 90 && delayed.p50 - baseline.p50 < 125);
	assert.ok(unaffected.p50 < 20, "control traffic must remain unshaped");
	assert.equal(networkCounters().drops, 0);
	setRtt(0);
	assert.ok(distribution(await probeRtt()).p50 < 20);
	console.log(JSON.stringify({ baseline, delayed, unaffected }));
} else {
	test("nearest-rank distributions retain sample count and reject invalid evidence", () => {
		assert.deepEqual(distribution([4, 1, 3, 2]), {
			count: 4,
			min: 1,
			p50: 2,
			p95: 4,
			p99: 4,
			max: 4,
			mean: 2.5,
		});
		assert.throws(() => distribution([]));
		assert.throws(() => distribution([NaN]));
	});
	test("network shaping refuses the current namespace", () => {
		assert.throws(() => initializeNetwork(readlinkSync("/proc/self/ns/net")));
	});
	test("isolated packet delay adds 100 ms RTT without delaying control traffic", () => {
		const output = execFileSync(
			"unshare",
			[
				"--user",
				"--map-root-user",
				"--net",
				process.execPath,
				import.meta.filename,
				"--child",
				readlinkSync("/proc/self/ns/net"),
			],
			{ encoding: "utf8", timeout: 30_000 },
		);
		console.log(output.trim());
	});
}
