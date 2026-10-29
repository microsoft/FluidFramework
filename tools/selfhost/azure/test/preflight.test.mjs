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

const checks = path.resolve(import.meta.dirname, "../preflight-helpers.sh");
const sku = (zones, restrictions = []) => [
	{
		name: "Standard_D8as_v5",
		family: "standardDASv5Family",
		capabilities: [{ name: "vCPUs", value: "8" }],
		locationInfo: [{ location: "eastus2", zones }],
		restrictions,
	},
];

function run(t, check, env = {}) {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), "selfhost-preflight-test-"));
	t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
	const result = spawnSync(
		"bash",
		[
			"-c",
			`
set -uo pipefail
. "$CHECKS"
FAILURES=0
fail() { echo "FAIL: $*"; FAILURES=$((FAILURES + 1)); }
note() { echo "NOTE: $*"; }
ok() { echo "OK: $*"; }
az() {
  echo "$*" >> "$PREFLIGHT_TEMP_DIR/calls"
  case "$1 $2" in
    "vm list-skus") printf '%s' "$SKUS"; return "\${SKU_EXIT:-0}" ;;
    "vm list-usage") printf '%s' "\${USAGE:-0 64}"; return 0 ;;
    "redisenterprise list"|"redis list") printf '%s' "\${CACHES:-[]}"; return "\${CACHES_EXIT:-0}" ;;
    "group exists") printf '%s' "\${GROUP_EXISTS:-true}"; return "\${GROUP_EXIT:-0}" ;;
    "deployment group")
      printf '%s\\n' "$ASYNC_RESPONSE"
      return "\${ASYNC_EXIT:-0}" ;;
    "rest --method")
      local arg
      for arg in "$@"; do
        case "$arg" in @*) cp "\${arg#@}" "$PREFLIGHT_TEMP_DIR/request.json" ;; esac
      done
      printf '%s\\n' "$RESPONSE"
      if [ "\${REST_EXIT:-0}" != 0 ]; then echo "BadRequest: insufficient capacity" >&2; fi
      return "\${REST_EXIT:-0}" ;;
  esac
}
"$CHECK"
exit "$FAILURES"
`,
		],
		{
			encoding: "utf8",
			env: {
				...process.env,
				CHECKS: checks,
				CHECK: check,
				PREFLIGHT_TEMP_DIR: temp,
				AKS_LOC: "eastus2",
				AKS_NODE_VM_SIZE: "Standard_D8as_v5",
				AKS_ZONES: "1 2 3",
				AKS_NODE_MIN_COUNT: "3",
				SKUS: JSON.stringify(sku(["1", "2", "3"])),
				SUB: "test-subscription",
				RG: "test-group",
				REDIS: "test-cache",
				REDIS_LOC: "eastus2",
				REDIS_SKU: "Balanced_B5",
				REDIS_HIGH_AVAILABILITY: "Enabled",
				REDIS_CAPACITY: "1",
				RESPONSE: '{"properties":{}}',
				ASYNC_RESPONSE: '{"properties":{}}',
				...env,
			},
		},
	);
	return {
		...result,
		calls: fs.readFileSync(path.join(temp, "calls"), "utf8"),
		request: () => JSON.parse(fs.readFileSync(path.join(temp, "request.json"), "utf8")),
	};
}

test("AKS reuses exactly one SKU request for VM family, vCPUs, and zones", (t) => {
	const result = run(t, "check_aks_capacity");
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.equal(result.calls.match(/^vm list-skus /gm)?.length, 1);
	assert.match(
		result.calls,
		/--resource-type virtualMachines --all --subscription test-subscription/,
	);
	assert.match(result.calls, /vm list-usage .*standardDASv5Family/);
	assert.match(result.stdout, /need 32 vCPUs/);
	assert.match(result.stdout, /supports all requested zones/);
	const script = fs.readFileSync(
		path.resolve(import.meta.dirname, "../preflight-check.sh"),
		"utf8",
	);
	assert.match(script, /check_aks_capacity/);
	const aksSection = script.slice(
		script.indexOf('banner "AKS node pool vCPU quota'),
		script.indexOf('banner "Cosmos DB region availability'),
	);
	assert.doesNotMatch(aksSection, /az vm list-skus/);
});

test("AKS requested zones are checked against subscription restrictions", (t) => {
	assert.equal(run(t, "check_aks_capacity").status, 0);
	for (const skus of [
		sku([]),
		[],
		sku(
			["1", "2", "3"],
			[{ type: "Zone", restrictionInfo: { locations: ["eastus2"], zones: ["1"] } }],
		),
		sku(["1", "2", "3"], [{ type: "Location", values: ["eastus2"] }]),
	]) {
		const result = run(t, "check_aks_capacity", { SKUS: JSON.stringify(skus) });
		assert.equal(result.status, 1, result.stdout);
		assert.match(result.stdout, /does not support requested zone/);
		assert.match(result.calls, /--all/);
	}
});

test("AKS ignores restrictions for a different region", (t) => {
	const result = run(t, "check_aks_capacity", {
		SKUS: JSON.stringify(
			sku(
				["1", "2", "3"],
				[{ type: "Zone", restrictionInfo: { locations: ["westus3"], zones: ["1"] } }],
			),
		),
	});
	assert.equal(result.status, 0, result.stdout);
});

test("AKS query and malformed response failures cannot pass zone validation", (t) => {
	for (const env of [{ SKU_EXIT: "1" }, { SKUS: "not-json" }, { SKUS: "{}" }]) {
		const result = run(t, "check_aks_capacity", env);
		assert.equal(result.status, 1);
		assert.match(result.stdout, /could not (query|parse)/);
		assert.equal(result.calls.match(/^vm list-skus /gm)?.length, 1);
		assert.doesNotMatch(result.stdout, /quota OK|supports all requested zones/);
	}
});

test("AKS reports quota shortfalls and still checks zones using the same SKU response", (t) => {
	const result = run(t, "check_aks_capacity", { USAGE: "40 64" });
	assert.equal(result.status, 1, result.stdout + result.stderr);
	assert.match(result.stdout, /quota SHORTFALL.*need 32 vCPUs/);
	assert.match(result.stdout, /supports all requested zones/);
	assert.equal(result.calls.match(/^vm list-skus /gm)?.length, 1);
});

test("non-zonal AKS pools still use the shared SKU request for quota", (t) => {
	const result = run(t, "check_aks_capacity", { AKS_ZONES: "" });
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.stdout, /quota OK/);
	assert.match(result.stdout, /non-zonal/);
	assert.equal(result.calls.match(/^vm list-skus /gm)?.length, 1);
});

test("explicit non-zonal pools do not require a SKU query", (t) => {
	const result = spawnSync(
		"bash",
		["-c", '. "$1"; note() { echo "$*"; }; AKS_ZONES=""; check_aks_zones', "_", checks],
		{
			encoding: "utf8",
		},
	);
	assert.equal(result.status, 0);
	assert.match(result.stdout, /non-zonal/);
});

test("Redis uses provider validation without creating or deploying resources", (t) => {
	const result = run(t, "check_redis_capacity");
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.calls, /\/validate\?api-version=2025-04-01/);
	assert.match(result.calls, /group exists .*--subscription test-subscription/);
	assert.match(result.calls, /redisenterprise list .*--subscription test-subscription/);
	assert.doesNotMatch(result.calls, /redisenterprise create|deployment group create/);
	const properties = result.request().properties;
	assert.equal(properties.validationLevel, "Provider");
	assert.deepEqual(properties.template.resources[0], {
		type: "Microsoft.Cache/redisEnterprise",
		apiVersion: "2025-07-01",
		name: "test-cache",
		location: "eastus2",
		sku: { name: "Balanced_B5" },
		properties: {
			highAvailability: "Enabled",
			minimumTlsVersion: "1.2",
			publicNetworkAccess: "Disabled",
		},
	});
	assert.match(result.stdout, /not a capacity reservation/);
});

test("Redis surfaces provider errors and rejects success-shaped error responses", (t) => {
	for (const env of [
		{ REST_EXIT: "1" },
		{ RESPONSE: '{"error":{"code":"BadRequest"}}' },
		{ RESPONSE: '{"properties":{"error":{"code":"BadRequest"}}}' },
		{ RESPONSE: '{"properties":{"provisioningState":"Running"}}' },
		{ RESPONSE: "{}" },
		{ RESPONSE: "not-json" },
	]) {
		const result = run(t, "check_redis_capacity", env);
		assert.equal(result.status, 1, result.stdout + result.stderr);
		assert.match(result.stdout, /Redis provider validation/);
		assert.match(result.stdout, /redis\.location.*redis\.sku.*redis\.useDeprecated=true/);
	}
});

test("Azure Cache fallback validates its own provider template without creating resources", (t) => {
	const result = run(t, "check_redis_capacity", {
		REDIS_SERVICE: "cache",
		REDIS_SKU: "Premium",
	});
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.calls, /redis list /);
	assert.doesNotMatch(result.calls, /redisenterprise|deployment group create/);
	const resource = result.request().properties.template.resources[0];
	assert.equal(resource.type, "Microsoft.Cache/Redis");
	assert.deepEqual(resource.properties.sku, { name: "Premium", family: "P", capacity: 1 });
	assert.equal(resource.properties.publicNetworkAccess, "Disabled");
	assert.equal(resource.properties.enableNonSslPort, false);
	assert.equal(resource.properties.minimumTlsVersion, "1.2");
	assert.equal(resource.properties.redisConfiguration["maxmemory-policy"], "volatile-lru");
});

test("Azure Cache query errors are surfaced and never fall back to AMR", (t) => {
	const result = run(t, "check_redis_capacity", {
		REDIS_SERVICE: "cache",
		REDIS_SKU: "Standard",
		CACHES_EXIT: "1",
	});
	assert.equal(result.status, 1);
	assert.doesNotMatch(result.calls, /rest|redisenterprise/);
});

test("Redis waits through the validation CLI when ARM accepts an asynchronous check", (t) => {
	const result = run(t, "check_redis_capacity", { RESPONSE: "" });
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.calls, /deployment group validate .*--validation-level Provider/);
	assert.match(result.stdout, /asynchronous/);
	assert.match(result.stdout, /provider validation passed/);
	assert.doesNotMatch(result.calls, /deployment group create/);
	for (const env of [
		{ ASYNC_EXIT: "1" },
		{ ASYNC_RESPONSE: '{"error":{"code":"BadRequest"}}' },
	]) {
		const failure = run(t, "check_redis_capacity", { RESPONSE: "", ...env });
		assert.equal(failure.status, 1, failure.stdout + failure.stderr);
		assert.doesNotMatch(failure.stdout, /validation passed/);
	}
});

test("Redis clearly reports when it cannot validate a not-yet-created resource group", (t) => {
	const result = run(t, "check_redis_capacity", { GROUP_EXISTS: "false" });
	assert.equal(result.status, 0);
	assert.match(result.stdout, /capacity was NOT validated/);
	assert.doesNotMatch(result.calls, /rest/);
});

test("existing Redis does not trigger a new allocation validation", (t) => {
	const result = run(t, "check_redis_capacity", { CACHES: '[{"name":"test-cache"}]' });
	assert.equal(result.status, 0);
	assert.match(result.stdout, /already exists/);
	assert.doesNotMatch(result.calls, /rest/);
});

test("Redis query failures cannot masquerade as an absent group or cache", (t) => {
	for (const env of [
		{ GROUP_EXIT: "1" },
		{ GROUP_EXISTS: "not-a-boolean" },
		{ CACHES_EXIT: "1" },
		{ CACHES: "not-json" },
	]) {
		const result = run(t, "check_redis_capacity", env);
		assert.equal(result.status, 1);
		assert.doesNotMatch(result.stdout, /capacity was NOT validated|already exists/);
		assert.doesNotMatch(result.calls, /rest/);
	}
});
