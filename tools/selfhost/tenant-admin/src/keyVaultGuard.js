/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Safety check for `rotate`: refuse to rotate the key a token service is actively signing with.
//
// A tenant has two keys precisely so rotation can be zero-downtime -- rotate the one nobody is
// using, move the token service onto it, then rotate the other. Rotating the key the token
// service is CURRENTLY configured with inverts that: riddler invalidates it immediately, and
// every token the Function App mints is rejected until someone writes the new value into Key
// Vault. The failure is silent at rotation time and only shows up as clients failing to connect,
// which is why this is enforced rather than documented.
//
// This module is pure: it compares two values it is handed and knows nothing about Azure or Key
// Vault. ./keyVaultClient.js does the reading. Keeping them apart is what lets the refusal be
// unit-tested without a cluster, and mirrors the transport-free design of ./tenantManager.js.

"use strict";

/**
 * Key Vault secret name the token service reads for a tenant.
 *
 * Must stay identical to kv_secret_name() in token-service/deploy-token-service.sh. If the two
 * ever drift, this guard looks at the wrong secret and silently stops protecting anything.
 */
function secretNameForTenant(tenantId) {
	return `fluid-tenant-key-${tenantId}`;
}

/** The other key of the pair -- the one that is safe to rotate first. */
function otherKeyName(keyName) {
	return keyName === "key1" ? "key2" : "key1";
}

/**
 * Throw if `currentKey` is the value the token service is signing with.
 *
 * No-ops when there is no binding to compare against (no Key Vault configured, or no secret for
 * this tenant -- meaning no token service is using it), and when `force` is set.
 *
 * @param {object} options
 * @param {string} options.tenantId
 * @param {"key1"|"key2"} options.keyName key about to be rotated
 * @param {string} [options.currentKey] its current value, read from riddler
 * @param {{ vaultName: string, secretName: string, secretValue: string }} [options.keyVaultBinding]
 * @param {boolean} [options.force]
 */
function assertKeyNotInUse({ tenantId, keyName, currentKey, keyVaultBinding, force = false }) {
	if (force || !keyVaultBinding) {
		return;
	}
	const { vaultName, secretName, secretValue } = keyVaultBinding;
	if (!secretValue || !currentKey || secretValue !== currentKey) {
		return;
	}

	const other = otherKeyName(keyName);
	throw new Error(
		`Refusing to rotate ${keyName} for tenant "${tenantId}": it is currently the same key ` +
			`stored in secret "${secretName}" in Key Vault "${vaultName}", which the token-minting ` +
			"Function App reads to sign tokens.\n" +
			`  Rotating it now BREAKS token minting for "${tenantId}" -- riddler invalidates the old ` +
			"key immediately, so every token the Function App mints is rejected until the newly " +
			"rotated key is written to that secret.\n" +
			`  Rotate without downtime instead: rotate the other key first ("rotate ${tenantId} ` +
			`--key ${other}"), write that new value to "${secretName}", confirm minting is healthy, ` +
			`then come back and rotate ${keyName}.\n` +
			"  Pass --force to override this check and rotate anyway (update the secret immediately " +
			"afterwards to restore token minting).",
	);
}

module.exports = {
	assertKeyNotInUse,
	otherKeyName,
	secretNameForTenant,
};
