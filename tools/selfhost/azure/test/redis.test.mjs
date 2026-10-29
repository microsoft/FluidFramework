/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const azure = path.resolve(import.meta.dirname, "..");

function workspace(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "selfhost-redis-test-"));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}

function config(t, redis) {
	const dir = workspace(t);
	const params = path.join(dir, "params.json");
	fs.writeFileSync(params, JSON.stringify({ location: "eastus2", redis }));
	return spawnSync(
		"bash",
		[
			"-c",
			`
set -euo pipefail
. "$1/redis-helpers.sh"
load_redis_config "$2"
write_redis_template "$3/template.json"
cat "$3/template.json"
printf '\\n%s\\n' "$REDIS_SERVICE/$REDIS_PORT/$REDIS_LOC/$REDIS_PE_GROUP/$REDIS_DNS_ZONE"
`,
			"_",
			azure,
			params,
			dir,
		],
		{ encoding: "utf8" },
	);
}

test("omitting redis.useDeprecated preserves AMR defaults and requires explicit HA", (t) => {
	const result = config(t, { clusterName: "test-amr", highAvailability: "Enabled" });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Balanced_B5/);
	assert.match(result.stdout, /managed\/10000\/eastus2\/redisEnterprise/);
	assert.match(result.stdout, /privatelink\.redis\.azure\.net/);
	for (const highAvailability of [undefined, "", "enabled", true]) {
		assert.notEqual(config(t, { highAvailability }).status, 0);
	}
});

test("redis.useDeprecated=false explicitly selects AMR", (t) => {
	const result = config(t, { useDeprecated: false, highAvailability: "Enabled" });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Microsoft.Cache\/redisEnterprise/);
	assert.match(result.stdout, /managed\/10000\/eastus2\/redisEnterprise/);
});

test("redis.useDeprecated rejects non-boolean values", (t) => {
	for (const useDeprecated of [null, "true", "false", 0, 1, [], {}]) {
		const result = config(t, { useDeprecated, highAvailability: "Enabled" });
		assert.notEqual(result.status, 0, JSON.stringify(useDeprecated));
		assert.match(result.stderr, /redis\.useDeprecated must be a boolean/);
	}
});

test("classic cache defaults to Premium P1 and does not require managed HA", (t) => {
	const result = config(t, { useDeprecated: true, clusterName: "test-cache" });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /"name": "Premium"/);
	assert.match(result.stdout, /"capacity": 1/);
	assert.match(result.stdout, /cache\/6380\/eastus2\/redisCache/);
	assert.match(result.stdout, /privatelink\.redis\.cache\.windows\.net/);
});

test("all supported fallback capacities produce numeric template capacities", (t) => {
	for (const [sku, start, end] of [
		["Premium", 1, 5],
		["Standard", 0, 6],
	]) {
		for (let capacity = start; capacity <= end; capacity++) {
			const result = config(t, { useDeprecated: true, sku, capacity, location: "westus3" });
			assert.equal(result.status, 0, result.stderr);
			const template = JSON.parse(
				result.stdout.slice(0, result.stdout.lastIndexOf("\ncache/")),
			);
			assert.equal(template.resources[0].properties.sku.capacity, capacity);
			assert.equal(template.resources[0].properties.sku.family, sku === "Premium" ? "P" : "C");
			assert.equal(template.resources[0].location, "westus3");
		}
	}
});

test("invalid selectors, types, fallback sizes, and removed settings fail explicitly", (t) => {
	for (const redis of [
		{ service: "other" },
		{ service: "managed", highAvailability: "Enabled" },
		{ service: "cache", useDeprecated: true },
		{ useDeprecated: true, sku: "Basic" },
		{ useDeprecated: true, sku: "Premium", capacity: 0 },
		{ useDeprecated: true, sku: "Premium", capacity: 6 },
		{ useDeprecated: true, sku: "Standard", capacity: 7 },
		{ useDeprecated: true, capacity: -1 },
		{ useDeprecated: true, capacity: 1.5 },
		{ useDeprecated: true, capacity: "1" },
		{ useDeprecated: true, capacity: false },
		{ useDeprecated: true, location: [] },
		{ useDeprecated: true, zones: [] },
		{ useDeprecated: true, replicasPerMaster: 1 },
		{ useDeprecated: true, vmSize: "P1" },
		{ useDeprecated: true, version: "6" },
		null,
		[],
	]) {
		const result = config(t, redis);
		assert.notEqual(result.status, 0, JSON.stringify(redis));
		assert.match(result.stderr, /ERROR:/);
	}
});

test("the AKS TLS probe accepts only authenticated PONG and fails closed on socket errors", (t) => {
	const dir = workspace(t);
	const preload = path.join(dir, "mock-tls.cjs");
	fs.writeFileSync(
		preload,
		`
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const load = Module._load;
Module._load = function (id, ...args) {
  if (id !== "node:tls") return load.call(this, id, ...args);
  return { connect(options) {
    if (!options.rejectUnauthorized || options.servername !== options.host) process.exit(2);
    const socket = new EventEmitter();
    socket.setTimeout = () => {};
    socket.destroy = () => {};
    socket.end = () => { socket.emit("end"); socket.emit("close"); };
    socket.write = value => {
      if (!value.includes("AUTH") || !value.includes("PING")) process.exit(2);
      if (process.env.PROBE_RESULT === "close") socket.emit("close");
      else if (process.env.PROBE_RESULT === "error") socket.emit("error", new Error("test"));
      else socket.emit("data", Buffer.from(process.env.PROBE_RESULT === "ok" ? "+OK\\r\\n+PONG\\r\\n" : "-WRONGPASS\\r\\n"));
    };
    process.nextTick(() => socket.emit("secureConnect"));
    return socket;
  }};
};
`,
	);
	for (const mode of ["ok", "close", "error", "wrongpass"]) {
		const result = spawnSync(
			"bash",
			[
				"-c",
				`
set -euo pipefail
. "$AZURE/migrate-redis.sh"
SENSITIVE_TEMP_FILES=()
DEPLOY_DIR="$TEST_DIR"
REDIS=test-amr; RG=test-group; REDIS_HOSTNAME=test.redis.azure.net; REDIS_PORT=10000
az() { printf '%s' test-only-probe-key; }
log() { echo "$*"; }
sleep() { :; }
kubectl() {
  [[ "$*" != *test-only-probe-key* ]] || return 2
  while [[ "$1" != -- ]]; do shift; done
  shift
  NODE_OPTIONS="--require=$PRELOAD" "$@"
}
probe_managed_redis
`,
			],
			{
				encoding: "utf8",
				timeout: 10000,
				env: {
					...process.env,
					AZURE: azure,
					TEST_DIR: dir,
					PRELOAD: preload,
					PROBE_RESULT: mode,
				},
			},
		);
		assert.equal(result.status, mode === "ok" ? 0 : 1, result.stdout + result.stderr);
		assert.doesNotMatch(result.stdout + result.stderr, /test-only-probe-key/);
		assert.equal(fs.existsSync(path.join(dir, "redis-probe.json")), false);
	}
});
