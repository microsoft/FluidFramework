/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Reads one Key Vault secret from inside the cluster, as the AKS workload identity.
//
// WHY THIS EXISTS
//
// The vault has public network access disabled and is reachable only through its private
// endpoint in the AKS VNet, so an operator workstation cannot read it. The alternative --
// flipping public access on for the read and back afterwards -- briefly exposes the vault to the
// internet on every key rotation, which is not a trade worth making for a pre-flight check.
//
// tenant-admin already runs inside that VNet (see ../tenant-admin.sh), so the read belongs here.
// The Pod uses the same `fluid-workload-identity` ServiceAccount every app pod uses, whose
// managed identity holds "Key Vault Secrets User" on the vault (azure/deploy.sh phase8_keyvault).
// Nothing has to be opened, and no credential is passed in from outside.
//
// WHY IT IS HAND-ROLLED
//
// This package has zero runtime dependencies on purpose: tenant-admin.sh mounts these files into
// a Pod built from the routerlicious image, with no package.json and no node_modules (see
// test/deployedLayout.test.js). @azure/identity and @azure/keyvault-secrets are not available and
// cannot be added without changing how the tool is deployed. The federated-token exchange is a
// documented OAuth2 client-credentials flow, so it is a short fetch() away.

"use strict";

const fs = require("node:fs");

const VAULT_SCOPE = "https://vault.azure.net/.default";
// Key Vault data-plane API. 7.4 is GA and supports plain secret GET.
const SECRETS_API_VERSION = "7.4";

/**
 * Raised when the check could not run, as opposed to running and finding nothing. Callers must
 * treat this as fail-closed: not knowing whether a key is in use is not the same as knowing it
 * is free.
 */
class KeyVaultAccessError extends Error {
	constructor(message) {
		super(message);
		this.name = "KeyVaultAccessError";
	}
}

/**
 * Environment injected by the AKS workload-identity webhook into any Pod labelled
 * `azure.workload.identity/use: "true"` whose ServiceAccount carries the client-id annotation.
 * Its absence means the Pod was not admitted by the webhook, which is a deployment problem
 * rather than a missing secret -- so it is reported, not swallowed.
 */
function readWorkloadIdentityEnv(env = process.env) {
	const clientId = env.AZURE_CLIENT_ID;
	const tenantId = env.AZURE_TENANT_ID;
	const tokenFile = env.AZURE_FEDERATED_TOKEN_FILE;
	const authorityHost = env.AZURE_AUTHORITY_HOST ?? "https://login.microsoftonline.com/";
	if (!clientId || !tenantId || !tokenFile) {
		throw new KeyVaultAccessError(
			"This Pod has no workload identity: the AKS workload-identity webhook did not inject " +
				"AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_FEDERATED_TOKEN_FILE. Confirm the Pod sets " +
				'serviceAccountName and the label azure.workload.identity/use: "true".',
		);
	}
	return { clientId, tenantId, tokenFile, authorityHost };
}

/**
 * Trade the projected ServiceAccount token for an Entra access token for the Key Vault
 * data plane (OAuth2 client credentials with a client assertion).
 */
async function getVaultAccessToken(
	{ clientId, tenantId, tokenFile, authorityHost },
	fetchImpl,
) {
	let assertion;
	try {
		assertion = fs.readFileSync(tokenFile, "utf8").trim();
	} catch (error) {
		throw new KeyVaultAccessError(
			`Could not read the projected federated token at ${tokenFile}: ${error.message}`,
		);
	}

	const base = authorityHost.endsWith("/") ? authorityHost : `${authorityHost}/`;
	const body = new URLSearchParams({
		client_id: clientId,
		grant_type: "client_credentials",
		scope: VAULT_SCOPE,
		client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		client_assertion: assertion,
	});

	const response = await fetchImpl(`${base}${tenantId}/oauth2/v2.0/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});
	if (!response.ok) {
		// The response body carries an AADSTS code that is the whole diagnosis (a missing
		// federated credential, a wrong subject, an unconsented scope), and contains no secret.
		const detail = await response.text().catch(() => "");
		throw new KeyVaultAccessError(
			`Exchanging the workload identity token for a Key Vault token failed with ` +
				`${response.status}. ${detail}`.trim(),
		);
	}
	const { access_token: accessToken } = await response.json();
	if (!accessToken) {
		throw new KeyVaultAccessError("Entra returned no access_token for the Key Vault scope.");
	}
	return accessToken;
}

/**
 * Read one secret.
 *
 * @returns {Promise<{ found: true, value: string } | { found: false }>} `found: false` means the
 *   secret genuinely does not exist (HTTP 404). Every other failure throws KeyVaultAccessError,
 *   so "no token service uses this tenant" is never confused with "could not check".
 */
async function getSecret(vaultName, secretName, { env, fetchImpl = fetch } = {}) {
	const identity = readWorkloadIdentityEnv(env);
	const accessToken = await getVaultAccessToken(identity, fetchImpl);

	const url =
		`https://${vaultName}.vault.azure.net/secrets/${encodeURIComponent(secretName)}` +
		`?api-version=${SECRETS_API_VERSION}`;
	const response = await fetchImpl(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (response.status === 404) {
		return { found: false };
	}
	if (response.status === 403 || response.status === 401) {
		throw new KeyVaultAccessError(
			`Key Vault "${vaultName}" refused to return secret "${secretName}" (HTTP ` +
				`${response.status}). The workload identity needs the "Key Vault Secrets User" role ` +
				"on the vault (azure/deploy.sh phase8_keyvault grants it).",
		);
	}
	if (!response.ok) {
		throw new KeyVaultAccessError(
			`Reading secret "${secretName}" from Key Vault "${vaultName}" failed with HTTP ${response.status}.`,
		);
	}

	const { value } = await response.json();
	if (typeof value !== "string") {
		throw new KeyVaultAccessError(
			`Key Vault "${vaultName}" returned secret "${secretName}" without a value.`,
		);
	}
	return { found: true, value };
}

module.exports = {
	KeyVaultAccessError,
	getSecret,
	getVaultAccessToken,
	readWorkloadIdentityEnv,
};
