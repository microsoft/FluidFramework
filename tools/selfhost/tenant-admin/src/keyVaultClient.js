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
// Authentication is delegated to Azure Identity's WorkloadIdentityCredential. The wrapper mounts
// the self-contained CLI bundle, where the credential implementation and its transitive MSAL
// dependency are pinned at bundle-build time.

"use strict";

const { WorkloadIdentityCredential } = require("@azure/identity");

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

function createWorkloadIdentityCredential({ clientId, tenantId, tokenFile, authorityHost }) {
	return new WorkloadIdentityCredential({
		clientId,
		tenantId,
		tokenFilePath: tokenFile,
		authorityHost,
	});
}

async function getVaultAccessToken(
	identity,
	credentialFactory = createWorkloadIdentityCredential,
) {
	try {
		const token = await credentialFactory(identity).getToken(VAULT_SCOPE);
		if (!token?.token) {
			throw new Error("Azure Identity returned no access token.");
		}
		return token.token;
	} catch (error) {
		throw new KeyVaultAccessError(
			`Azure Identity could not acquire a Key Vault token with the AKS workload identity: ${error.message}`,
		);
	}
}

/**
 * Read one secret.
 *
 * @returns {Promise<{ found: true, value: string } | { found: false }>} `found: false` means the
 *   secret genuinely does not exist (HTTP 404). Every other failure throws KeyVaultAccessError,
 *   so "no token service uses this tenant" is never confused with "could not check".
 */
async function getSecret(
	vaultName,
	secretName,
	{ env, fetchImpl = fetch, credentialFactory } = {},
) {
	const identity = readWorkloadIdentityEnv(env);
	const accessToken = await getVaultAccessToken(identity, credentialFactory);

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
	createWorkloadIdentityCredential,
	getSecret,
	getVaultAccessToken,
	readWorkloadIdentityEnv,
};
