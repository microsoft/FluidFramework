/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

/**
 * Configuration loading and validation.
 *
 * Every value comes from Function App application settings. The tenant key must be supplied
 * as a Key Vault reference (`@Microsoft.KeyVault(...)`) so the platform resolves it with the
 * app's managed identity and the secret never appears in configuration or source control.
 */

const { selectPolicy } = require("./authorize");

const DEFAULT_TENANT_ID = "fluid";
const DEFAULT_LIFETIME_SEC = 3600;

/**
 * riddler rejects a token whose declared lifetime (`exp - iat`) exceeds its own
 * `maxTokenLifetimeSec` when `enableTokenExpiration` is on. Minting past that ceiling produces
 * tokens that are refused at connect time, so the mismatch is caught here at startup instead.
 */
const DEFAULT_MAX_LIFETIME_SEC = 3600;

class ConfigError extends Error {}

/**
 * App-setting suffix for a tenant's key. Tenant ids are lowercase letters, digits and dashes,
 * so uppercasing and replacing dashes with underscores is unambiguous — an id cannot contain
 * an underscore, so two different tenants can never map to the same setting name.
 */
function keySettingName(tenantId) {
	return `FLUID_TENANT_KEY_${tenantId.toUpperCase().replace(/-/g, "_")}`;
}

/**
 * A Key Vault reference is handed to the app verbatim when it cannot be resolved. Signing with
 * the literal reference string would mint tokens riddler cannot validate, and the only symptom
 * would be an opaque connect-time failure, so it is rejected at startup.
 */
function assertResolved(value, settingName) {
	if (value.startsWith("@Microsoft.KeyVault(")) {
		throw new ConfigError(
			`${settingName} still contains an unresolved Key Vault reference. Confirm the Function ` +
				"App has a managed identity with 'Key Vault Secrets User' on the vault.",
		);
	}
}

function parsePositiveInt(raw, name, fallback) {
	if (raw === undefined || raw === "") {
		return fallback;
	}
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		throw new ConfigError(`${name} must be a positive integer, got "${raw}".`);
	}
	return value;
}

function parseList(raw) {
	if (!raw) {
		return [];
	}
	return raw
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

/**
 * Build the runtime configuration from an environment bag.
 *
 * @param env - Environment source, defaults to `process.env`. Injectable for tests.
 * @throws ConfigError when a required setting is missing or inconsistent.
 */
function loadConfig(env = process.env) {
	const tenantKey = env.FLUID_TENANT_KEY;
	if (!tenantKey) {
		throw new ConfigError(
			"FLUID_TENANT_KEY is not configured. Set it to a Key Vault reference, " +
				"e.g. @Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/tenant-key/).",
		);
	}

	const defaultTenantId = env.FLUID_TENANT_ID || DEFAULT_TENANT_ID;

	assertResolved(tenantKey, "FLUID_TENANT_KEY");

	// A key signs for exactly one tenant, so each served tenant needs its own key. Keeping this
	// as a map (rather than one key plus a list of tenant names) is what stops the service from
	// cheerfully signing a second tenant's token with the first tenant's key — tokens that look
	// fine here and are then rejected by riddler at connect time.
	const tenantKeys = { [defaultTenantId]: tenantKey };

	for (const tenantId of parseList(env.FLUID_ALLOWED_TENANTS)) {
		if (tenantId === defaultTenantId) {
			continue;
		}
		const settingName = keySettingName(tenantId);
		const key = env[settingName];
		if (!key) {
			throw new ConfigError(
				`Tenant "${tenantId}" is listed in FLUID_ALLOWED_TENANTS but ${settingName} is not ` +
					"set. Every served tenant needs its own signing key; a token signed with another " +
					"tenant's key is rejected by riddler.",
			);
		}
		assertResolved(key, settingName);
		tenantKeys[tenantId] = key;
	}

	const allowedTenants = Object.keys(tenantKeys);

	const maxTokenLifetimeSec = parsePositiveInt(
		env.FLUID_MAX_TOKEN_LIFETIME_SEC,
		"FLUID_MAX_TOKEN_LIFETIME_SEC",
		DEFAULT_MAX_LIFETIME_SEC,
	);
	const tokenLifetimeSec = parsePositiveInt(
		env.FLUID_TOKEN_LIFETIME_SEC,
		"FLUID_TOKEN_LIFETIME_SEC",
		DEFAULT_LIFETIME_SEC,
	);

	if (tokenLifetimeSec > maxTokenLifetimeSec) {
		throw new ConfigError(
			`FLUID_TOKEN_LIFETIME_SEC (${tokenLifetimeSec}) exceeds FLUID_MAX_TOKEN_LIFETIME_SEC ` +
				`(${maxTokenLifetimeSec}). riddler would reject every token minted at this lifetime. ` +
				"Lower the lifetime, or raise auth.maxTokenLifetimeSec in routerlicious-values.yaml to match.",
		);
	}

	// Restricting to one Entra tenant is what stops a multi-tenant app registration from
	// accepting users from any directory in the world.
	const entraTenantId = env.FLUID_ENTRA_TENANT_ID || undefined;

	// Which shipped authorization policy to apply. Named rather than edited in code so a
	// deployment can change its access model without a redeploy of different source.
	const authorizationPolicy = env.FLUID_AUTHORIZATION_POLICY || "default";
	selectPolicy(authorizationPolicy);

	// Escape hatch for `func start` on a developer machine, where no Easy Auth front end exists.
	// Defaults off and is refused whenever the app looks like it is running in Azure.
	const allowInsecureLocalDev = env.FLUID_ALLOW_INSECURE_LOCAL_DEV === "true";
	if (allowInsecureLocalDev && env.WEBSITE_INSTANCE_ID) {
		throw new ConfigError(
			"FLUID_ALLOW_INSECURE_LOCAL_DEV is enabled on a deployed Function App. This bypasses " +
				"authentication entirely and must never be set in Azure. Remove the setting.",
		);
	}

	return {
		tenantKeys,
		defaultTenantId,
		allowedTenants,
		tokenLifetimeSec,
		maxTokenLifetimeSec,
		entraTenantId,
		allowInsecureLocalDev,
		authorizationPolicy,
	};
}

module.exports = {
	ConfigError,
	DEFAULT_LIFETIME_SEC,
	DEFAULT_MAX_LIFETIME_SEC,
	DEFAULT_TENANT_ID,
	keySettingName,
	loadConfig,
};
