/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// The in-cluster Key Vault read that backs the `rotate` safety check.
//
// Everything here is exercised with injected credential and fetch doubles, so no cluster and no
// network are involved. A 404 means "no token service uses this tenant"; every authentication or
// transport failure means "the check could not run" and must fail closed.

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
	KeyVaultAccessError,
	getSecret,
	getVaultAccessToken,
	readWorkloadIdentityEnv,
} = require("../src/keyVaultClient");

function envWith() {
	return {
		AZURE_CLIENT_ID: "client-id-guid",
		AZURE_TENANT_ID: "tenant-id-guid",
		AZURE_FEDERATED_TOKEN_FILE: "/var/run/secrets/azure/tokens/azure-identity-token",
		AZURE_AUTHORITY_HOST: "https://login.microsoftonline.com/",
	};
}

function fakeCredentialFactory({ token = "vault-access-token", error } = {}) {
	const calls = [];
	const factory = (options) => ({
		getToken: async (scope) => {
			calls.push({ options, scope });
			if (error) {
				throw error;
			}
			return token === undefined ? null : { token, expiresOnTimestamp: Date.now() + 3600000 };
		},
	});
	factory.calls = calls;
	return factory;
}

function fakeFetch({ vaultStatus = 200, vaultBody = { value: "the-secret" } }) {
	const calls = [];
	const impl = async (url, init) => {
		calls.push({ url: String(url), init });
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
		env: envWith(),
		fetchImpl,
		credentialFactory: fakeCredentialFactory(),
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
		env: envWith(),
		fetchImpl: fakeFetch({ vaultStatus: 404 }),
		credentialFactory: fakeCredentialFactory(),
	});
	assert.deepEqual(result, { found: false });
});

test("a denied read throws, and names the role that is missing", async () => {
	await assert.rejects(
		() =>
			getSecret("my-kv", "fluid-tenant-key-contoso", {
				env: envWith(),
				fetchImpl: fakeFetch({ vaultStatus: 403 }),
				credentialFactory: fakeCredentialFactory(),
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
				env: envWith(),
				fetchImpl: fakeFetch({ vaultStatus: 500 }),
				credentialFactory: fakeCredentialFactory(),
			}),
		KeyVaultAccessError,
	);
});

test("a secret with no value throws instead of comparing against undefined", async () => {
	await assert.rejects(
		() =>
			getSecret("my-kv", "s", {
				env: envWith(),
				fetchImpl: fakeFetch({ vaultBody: {} }),
				credentialFactory: fakeCredentialFactory(),
			}),
		KeyVaultAccessError,
	);
});

test("an Azure Identity failure preserves its diagnostic detail", async () => {
	await assert.rejects(
		() =>
			getSecret("my-kv", "s", {
				env: envWith(),
				fetchImpl: fakeFetch({}),
				credentialFactory: fakeCredentialFactory({
					error: new Error("AADSTS700213: no matching federated identity record."),
				}),
			}),
		(error) => {
			assert.ok(error instanceof KeyVaultAccessError);
			assert.match(error.message, /AADSTS700213/);
			return true;
		},
	);
});

test("Azure Identity receives the workload identity settings and Key Vault scope", async () => {
	const credentialFactory = fakeCredentialFactory();
	const identity = readWorkloadIdentityEnv(envWith());
	const token = await getVaultAccessToken(identity, credentialFactory);

	assert.equal(token, "vault-access-token");
	assert.deepEqual(credentialFactory.calls, [
		{
			options: {
				clientId: "client-id-guid",
				tenantId: "tenant-id-guid",
				tokenFile: "/var/run/secrets/azure/tokens/azure-identity-token",
				authorityHost: "https://login.microsoftonline.com/",
			},
			scope: "https://vault.azure.net/.default",
		},
	]);
});

test("a Pod without workload identity is reported, not silently skipped", async () => {
	// The webhook injects these only for a Pod that sets serviceAccountName AND the
	// azure.workload.identity/use label. Missing env is a deployment mistake, and treating it as
	// "nothing to check" would disable the guard exactly when it is misconfigured.
	assert.throws(
		() => readWorkloadIdentityEnv({}),
		(error) => {
			assert.ok(error instanceof KeyVaultAccessError);
			assert.match(error.message, /azure\.workload\.identity\/use/);
			return true;
		},
	);

	await assert.rejects(
		() =>
			getSecret("my-kv", "s", {
				env: {},
				fetchImpl: fakeFetch({}),
				credentialFactory: fakeCredentialFactory(),
			}),
		KeyVaultAccessError,
	);
});

test("an empty Azure Identity token is rejected", async () => {
	await assert.rejects(
		() =>
			getVaultAccessToken(
				readWorkloadIdentityEnv(envWith()),
				fakeCredentialFactory({ token: null }),
			),
		(error) => {
			assert.ok(error instanceof KeyVaultAccessError);
			assert.match(error.message, /returned no access token/);
			return true;
		},
	);
});
