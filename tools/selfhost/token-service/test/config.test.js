/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ConfigError, keySettingName, loadConfig } = require("../src/config");

const VALID_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("loadConfig applies documented defaults", () => {
	const config = loadConfig({ FLUID_TENANT_KEY: VALID_KEY });

	assert.equal(config.defaultTenantId, "fluid");
	assert.deepEqual(config.allowedTenants, ["fluid"]);
	assert.equal(config.tokenLifetimeSec, 3600);
	assert.equal(config.maxTokenLifetimeSec, 3600);
	assert.equal(config.allowInsecureLocalDev, false);
});

test("loadConfig requires a tenant key", () => {
	assert.throws(() => loadConfig({}), ConfigError);
});

test("loadConfig rejects an unresolved Key Vault reference", () => {
	// Signing with the literal reference string would produce tokens riddler cannot validate,
	// and the failure would otherwise only surface as a confusing 401 at connect time.
	assert.throws(
		() =>
			loadConfig({
				FLUID_TENANT_KEY:
					"@Microsoft.KeyVault(SecretUri=https://v.vault.azure.net/secrets/tenant-key/)",
			}),
		/unresolved Key Vault reference/,
	);
});

test("loadConfig rejects a lifetime above riddler's ceiling", () => {
	assert.throws(
		() =>
			loadConfig({
				FLUID_TENANT_KEY: VALID_KEY,
				FLUID_TOKEN_LIFETIME_SEC: "7200",
				FLUID_MAX_TOKEN_LIFETIME_SEC: "3600",
			}),
		/exceeds FLUID_MAX_TOKEN_LIFETIME_SEC/,
	);
});

test("loadConfig accepts a lifetime equal to the ceiling", () => {
	const config = loadConfig({
		FLUID_TENANT_KEY: VALID_KEY,
		FLUID_TOKEN_LIFETIME_SEC: "3600",
		FLUID_MAX_TOKEN_LIFETIME_SEC: "3600",
	});
	assert.equal(config.tokenLifetimeSec, 3600);
});

test("loadConfig rejects non-positive and non-integer lifetimes", () => {
	for (const value of ["0", "-1", "abc", "1.5"]) {
		assert.throws(
			() => loadConfig({ FLUID_TENANT_KEY: VALID_KEY, FLUID_TOKEN_LIFETIME_SEC: value }),
			ConfigError,
			`expected "${value}" to be rejected`,
		);
	}
});

test("loadConfig refuses the insecure local-dev bypass when running in Azure", () => {
	assert.throws(
		() =>
			loadConfig({
				FLUID_TENANT_KEY: VALID_KEY,
				FLUID_ALLOW_INSECURE_LOCAL_DEV: "true",
				WEBSITE_INSTANCE_ID: "abc123",
			}),
		/must never be set in Azure/,
	);
});

test("loadConfig allows the local-dev bypass off-platform", () => {
	const config = loadConfig({
		FLUID_TENANT_KEY: VALID_KEY,
		FLUID_ALLOW_INSECURE_LOCAL_DEV: "true",
	});
	assert.equal(config.allowInsecureLocalDev, true);
});

test("loadConfig requires a per-tenant key for every additional tenant", () => {
	// Without this guard the service would sign a second tenant's token with the first
	// tenant's key and return a confident 200. riddler then rejects it at connect time, with
	// nothing in the token service's logs to explain why.
	assert.throws(
		() =>
			loadConfig({
				FLUID_TENANT_KEY: VALID_KEY,
				FLUID_ALLOWED_TENANTS: "fluid,marketing",
			}),
		/FLUID_TENANT_KEY_MARKETING is not set/,
	);
});

test("loadConfig builds a key map when every tenant has its own key", () => {
	const config = loadConfig({
		FLUID_TENANT_KEY: VALID_KEY,
		FLUID_ALLOWED_TENANTS: "fluid, marketing ,eng-team",
		FLUID_TENANT_KEY_MARKETING: `${VALID_KEY}aa`,
		FLUID_TENANT_KEY_ENG_TEAM: `${VALID_KEY}bb`,
	});

	assert.deepEqual(config.allowedTenants, ["fluid", "marketing", "eng-team"]);
	assert.equal(config.tenantKeys.fluid, VALID_KEY);
	assert.equal(config.tenantKeys.marketing, `${VALID_KEY}aa`);
	// Dashes map to underscores in the setting name, so eng-team reads FLUID_TENANT_KEY_ENG_TEAM.
	assert.equal(config.tenantKeys["eng-team"], `${VALID_KEY}bb`);
});

test("loadConfig serves only the default tenant when no allow-list is given", () => {
	const config = loadConfig({ FLUID_TENANT_KEY: VALID_KEY, FLUID_TENANT_ID: "contoso" });

	assert.deepEqual(config.allowedTenants, ["contoso"]);
	assert.deepEqual(config.tenantKeys, { contoso: VALID_KEY });
});

test("loadConfig rejects an unresolved Key Vault reference for an additional tenant", () => {
	assert.throws(
		() =>
			loadConfig({
				FLUID_TENANT_KEY: VALID_KEY,
				FLUID_ALLOWED_TENANTS: "fluid,marketing",
				FLUID_TENANT_KEY_MARKETING:
					"@Microsoft.KeyVault(SecretUri=https://v.vault.azure.net/secrets/k/)",
			}),
		/unresolved Key Vault reference/,
	);
});

test("loadConfig defaults to the permissive policy and accepts the shipped names", () => {
	assert.equal(loadConfig({ FLUID_TENANT_KEY: VALID_KEY }).authorizationPolicy, "default");
	for (const name of ["default", "tenant-scoped", "role-based"]) {
		assert.equal(
			loadConfig({ FLUID_TENANT_KEY: VALID_KEY, FLUID_AUTHORIZATION_POLICY: name })
				.authorizationPolicy,
			name,
		);
	}
});

test("loadConfig rejects an unknown policy name", () => {
	// Falling back to the default on a typo would quietly hand every user access to every
	// tenant, which is the opposite of what naming a stricter policy asks for.
	assert.throws(
		() =>
			loadConfig({ FLUID_TENANT_KEY: VALID_KEY, FLUID_AUTHORIZATION_POLICY: "tenantScoped" }),
		/Unknown authorization policy/,
	);
});

test("keySettingName maps a tenant id to its app setting unambiguously", () => {
	assert.equal(keySettingName("marketing"), "FLUID_TENANT_KEY_MARKETING");
	assert.equal(keySettingName("eng-team"), "FLUID_TENANT_KEY_ENG_TEAM");
});
