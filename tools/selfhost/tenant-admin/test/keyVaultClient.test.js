/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The in-cluster Key Vault read that backs the `rotate` safety check.
//
// Everything here is exercised with an injected fetch and a real temp token file, so no cluster
// and no network are involved. What matters is the status-code contract the guard depends on:
// 404 means "no token service uses this tenant" and is safe to continue past, while every other
// failure means "the check could not run" and must be distinguishable, because the caller has to
// fail closed on it.

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
	KeyVaultAccessError,
	getSecret,
	readWorkloadIdentityEnv,
} = require("../src/keyVaultClient");

function tokenFile(contents = "federated-token-value") {
	const file = path.join(
		fs.mkdtempSync(path.join(os.tmpdir(), "tenant-admin-wi-")),
		"token",
	);
	fs.writeFileSync(file, contents);
	return file;
}

function envWith(file) {
	return {
		AZURE_CLIENT_ID: "client-id-guid",
		AZURE_TENANT_ID: "tenant-id-guid",
		AZURE_FEDERATED_TOKEN_FILE: file,
		AZURE_AUTHORITY_HOST: "https://login.microsoftonline.com/",
	};
}

/** Minimal fetch double: token endpoint first, then the vault. */
function fakeFetch({ vaultStatus = 200, vaultBody = { value: "the-secret" }, tokenStatus = 200 }) {
	const calls = [];
	const impl = async (url, init) => {
		calls.push({ url: String(url), init });
		if (String(url).includes("/oauth2/v2.0/token")) {
			return {
				ok: tokenStatus >= 200 && tokenStatus < 300,
				status: tokenStatus,
				json: async () => ({ access_token: "vault-access-token" }),
				text: async () => "AADSTS700213: no matching federated identity record.",
			};
		}
		return {
			ok: vaultStatus >= 200 && vaultStatus < 300,
			status: vaultStatus,
			json: async () => vaultBody,
			text: async () => "",
		};
	};
	impl.calls = calls;
	return impl;
}

test("a secret that exists is returned", async () => {
	const fetchImpl = fakeFetch({});
	const result = await getSecret("my-kv", "fluid-tenant-key-contoso", {
		env: envWith(tokenFile()),
		fetchImpl,
	});

	assert.deepEqual(result, { found: true, value: "the-secret" });

	// The vault request must be scoped to the right vault and secret, and carry the token from
	// the exchange -- a wrong URL here would silently check the wrong secret.
	const vaultCall = fetchImpl.calls.find((c) => c.url.includes("vault.azure.net"));
	assert.match(
		vaultCall.url,
		/^https:\/\/my-kv\.vault\.azure\.net\/secrets\/fluid-tenant-key-contoso\?api-version=/,
	);
	assert.equal(vaultCall.init.headers.Authorization, "Bearer vault-access-token");
});

test("a missing secret reports found:false rather than throwing", async () => {
	// This is the "no token service uses this tenant" path. It must be distinguishable from a
	// failure, or a tenant with no token service could never be rotated.
	const result = await getSecret("my-kv", "fluid-tenant-key-contoso", {
		env: envWith(tokenFile()),
		fetchImpl: fakeFetch({ vaultStatus: 404 }),
	});
	assert.deepEqual(result, { found: false });
});

test("a denied read throws, and names the role that is missing", async () => {
	await assert.rejects(
		() =>
			getSecret("my-kv", "fluid-tenant-key-contoso", {
				env: envWith(tokenFile()),
				fetchImpl: fakeFetch({ vaultStatus: 403 }),
			}),
		(error) => {
			assert.ok(error instanceof KeyVaultAccessError);
			assert.match(error.message, /Key Vault Secrets User/);
			return true;
		},
	);
});

test("an unexpected vault status throws rather than being read as absent", async () => {
	await assert.rejects(
		() =>
			getSecret("my-kv", "s", {
				env: envWith(tokenFile()),
				fetchImpl: fakeFetch({ vaultStatus: 500 }),
			}),
		KeyVaultAccessError,
	);
});

test("a secret with no value throws instead of comparing against undefined", async () => {
	await assert.rejects(
		() =>
			getSecret("my-kv", "s", {
				env: envWith(tokenFile()),
				fetchImpl: fakeFetch({ vaultBody: {} }),
			}),
		KeyVaultAccessError,
	);
});

test("a failed token exchange surfaces the AADSTS detail", async () => {
	// The AADSTS code is the entire diagnosis for a misconfigured federated credential, and it
	// contains no secret material, so it is worth passing through.
	await assert.rejects(
		() =>
			getSecret("my-kv", "s", {
				env: envWith(tokenFile()),
				fetchImpl: fakeFetch({ tokenStatus: 400 }),
			}),
		(error) => {
			assert.ok(error instanceof KeyVaultAccessError);
			assert.match(error.message, /AADSTS700213/);
			return true;
		},
	);
});

test("the token exchange presents the projected token as a client assertion", async () => {
	const fetchImpl = fakeFetch({});
	await getSecret("my-kv", "s", {
		env: envWith(tokenFile("projected-sa-token")),
		fetchImpl,
	});

	const tokenCall = fetchImpl.calls.find((c) => c.url.includes("/oauth2/v2.0/token"));
	assert.equal(tokenCall.url, "https://login.microsoftonline.com/tenant-id-guid/oauth2/v2.0/token");
	const body = tokenCall.init.body;
	assert.equal(body.get("client_assertion"), "projected-sa-token");
	assert.equal(body.get("client_id"), "client-id-guid");
	assert.equal(body.get("scope"), "https://vault.azure.net/.default");
	assert.equal(
		body.get("client_assertion_type"),
		"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
	);
});

test("a Pod without workload identity is reported, not silently skipped", async () => {
	// The webhook injects these only for a Pod that sets serviceAccountName AND the
	// azure.workload.identity/use label. Missing env is a deployment mistake, and treating it as
	// "nothing to check" would disable the guard exactly when it is misconfigured.
	assert.throws(() => readWorkloadIdentityEnv({}), (error) => {
		assert.ok(error instanceof KeyVaultAccessError);
		assert.match(error.message, /azure\.workload\.identity\/use/);
		return true;
	});

	await assert.rejects(
		() => getSecret("my-kv", "s", { env: {}, fetchImpl: fakeFetch({}) }),
		KeyVaultAccessError,
	);
});

test("the authority host is normalised whether or not it ends in a slash", async () => {
	const fetchImpl = fakeFetch({});
	await getSecret("my-kv", "s", {
		env: { ...envWith(tokenFile()), AZURE_AUTHORITY_HOST: "https://login.microsoftonline.com" },
		fetchImpl,
	});
	const tokenCall = fetchImpl.calls.find((c) => c.url.includes("/oauth2/"));
	assert.equal(tokenCall.url, "https://login.microsoftonline.com/tenant-id-guid/oauth2/v2.0/token");
});
