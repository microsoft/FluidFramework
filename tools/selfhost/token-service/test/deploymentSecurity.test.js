/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const TOKEN_DEPLOY = fs.readFileSync(
	path.join(ROOT, "token-service", "deploy-token-service.sh"),
	"utf8",
);
const TOKEN_FUNCTIONS = fs.readFileSync(
	path.join(ROOT, "token-service", "src", "functions", "token.js"),
	"utf8",
);
const STACK_DEPLOY = fs.readFileSync(path.join(ROOT, "azure", "deploy.sh"), "utf8");
const PREFLIGHT = fs.readFileSync(
	path.join(ROOT, "azure", "preflight-check.sh"),
	"utf8",
);

test("workstation deployment restores Key Vault network isolation", () => {
	assert.match(TOKEN_DEPLOY, /--public-network-access Enabled/);
	assert.match(TOKEN_DEPLOY, /restore_keyvault_public_access/);
	assert.match(TOKEN_DEPLOY, /trap cleanup_deployment_state EXIT/);
	assert.match(STACK_DEPLOY, /--public-network-access Enabled/);
	assert.match(STACK_DEPLOY, /phase8_keyvault_lockdown/);
	assert.match(STACK_DEPLOY, /--public-network-access Disabled/);
	assert.match(STACK_DEPLOY, /trap cleanup_deployment_state EXIT/);
});

test("temporary deployer Key Vault roles are removed on exit", () => {
	for (const script of [TOKEN_DEPLOY, STACK_DEPLOY]) {
		assert.match(script, /TEMP_ROLE_ASSIGNMENT_IDS/);
		assert.match(script, /az rest --method delete/);
	}
	assert.match(TOKEN_DEPLOY, /trap cleanup_deployment_state EXIT/);
	assert.match(STACK_DEPLOY, /trap cleanup_deployment_state EXIT/);
});

test("deployment tooling uses private unpredictable temporary paths", () => {
	for (const script of [TOKEN_DEPLOY, STACK_DEPLOY, PREFLIGHT]) {
		assert.doesNotMatch(script, /\/tmp\/[^\s"']*\$\$/);
		assert.doesNotMatch(script, /\$\{TMPDIR:-\/tmp\}\/[^\s"']*\$\$/);
	}
	assert.match(
		TOKEN_DEPLOY,
		/mktemp -d "\$\{TMPDIR:-\/tmp\}\/selfhost-token-service\.XXXXXX"/,
	);
	assert.match(TOKEN_DEPLOY, /rm -rf "\$TOKEN_SERVICE_TEMP_DIR"/);
	assert.match(
		STACK_DEPLOY,
		/mktemp -d "\$TEMP_BASE\/selfhost-fluid-\$\{AKS\}\.XXXXXX"/,
	);
	assert.match(
		PREFLIGHT,
		/mktemp -d "\$\{TMPDIR:-\/tmp\}\/selfhost-preflight\.XXXXXX"/,
	);
});

test("Function App platform hardening is configured and verified", () => {
	for (const setting of [
		"properties.minTlsVersion=1.2",
		"properties.scmMinTlsVersion=1.2",
		"properties.ftpsState=Disabled",
		"properties.remoteDebuggingEnabled=false",
		"properties.healthCheckPath=/api/health",
		"basicPublishingCredentialsPolicies",
	]) {
		assert.match(TOKEN_DEPLOY, new RegExp(setting.replace(/[./]/g, "\\$&")));
	}
	assert.match(TOKEN_DEPLOY, /--ids "\$site_id\/config\/web"/);
	assert.match(
		TOKEN_DEPLOY,
		/--ids "\$site_id\/basicPublishingCredentialsPolicies\/\$policy"/,
	);
	assert.match(
		TOKEN_DEPLOY,
		/az resource show --ids "\$site_id"[\s\S]*?--query properties\.httpsOnly/,
	);
	assert.doesNotMatch(TOKEN_DEPLOY, /--name "\$FUNC_APP\/(?:web|ftp|scm)"/);
	assert.doesNotMatch(TOKEN_DEPLOY, /az functionapp show[^;\n]*--query httpsOnly/);
});

test("nonexistent additional tenants are warned about and skipped", () => {
	assert.match(TOKEN_DEPLOY, /get "\$tenant" >\/dev\/null 2>"\$tenant_check_err"/);
	assert.match(TOKEN_DEPLOY, /WARNING: Tenant '\$tenant'.*does not exist; skipping it/);
	assert.match(TOKEN_DEPLOY, /TENANTS=\("\$\{existing_tenants\[@\]\}"\)/);
	assert.match(TOKEN_DEPLOY, /Default tenant '\$tenant' does not exist/);
});

test("wildcard CORS is refused", () => {
	assert.match(TOKEN_DEPLOY, /fail "CORS contains '\*'/);
});

test("Front Door NSG access accounts for delayed policy and rule precedence", () => {
	assert.match(STACK_DEPLOY, /ensure_frontdoor_nsg_allow/);
	assert.match(STACK_DEPLOY, /internet_deny_priority_on_port80/);
	assert.match(STACK_DEPLOY, /blocking_priority/);
	assert.match(STACK_DEPLOY, /for \(\(priority=blocking_priority - 1;/);
	assert.doesNotMatch(STACK_DEPLOY, /AllowAzureFrontDoorBackend[\s\S]{0,200}--priority 110/);
	assert.match(
		STACK_DEPLOY,
		/phase12_restrict_origin_nsg\(\)[\s\S]*phase0_network_allow_frontdoor/,
	);
});

test("deployment verifies every Front Door origin end to end", () => {
	assert.match(STACK_DEPLOY, /verify_frontdoor_origin_health/);
	for (const path of ["/api/v1/ping", "/healthz/startup", "/repos/ping"]) {
		assert.match(STACK_DEPLOY, new RegExp(path.replaceAll("/", "\\/")));
	}
	assert.match(STACK_DEPLOY, /curl[\s\S]*https:\/\/\$\{hostname\}\$\{path\}/);
});

test("token issuance is registered for POST only", () => {
	assert.match(TOKEN_FUNCTIONS, /app\.http\("token", \{\s+methods: \["POST"\]/);
});
