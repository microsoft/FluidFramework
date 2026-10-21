/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	findBlockedEndpoints,
	formatEndpointAccess,
	isAzureArtifactsRegistry,
	normalizeEndpointUrl,
	npmRegistryEndpoint,
	parseRegistryConfig,
	planEndpoints,
	probeEndpoints,
	redactRegistry,
	sigstoreTufEndpoint,
} from "../registry-access.js";

test("classifies endpoint probe outcomes", async () => {
	const requested: string[] = [];
	const fakeFetch: typeof fetch = async (input) => {
		const url = String(input);
		requested.push(url);
		if (url.startsWith("https://ok.example")) {
			return new Response("{}", { status: 200 });
		}
		if (url.startsWith("https://denied.example")) {
			return new Response("", { status: 403 });
		}
		if (url.startsWith("https://slow.example")) {
			throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
		}
		throw new TypeError("fetch failed", {
			cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }),
		});
	};
	const access = await probeEndpoints(
		[
			npmRegistryEndpoint("https://ok.example/", "metadata"),
			npmRegistryEndpoint("https://denied.example", "metadata", false),
			{
				url: "https://slow.example",
				probePath: "/timestamp.json",
				purpose: "trust",
				required: true,
			},
			npmRegistryEndpoint("https://missing.example", "metadata"),
		],
		fakeFetch,
	);
	assert.deepEqual(requested.sort(), [
		"https://denied.example/-/ping",
		"https://missing.example/-/ping",
		"https://ok.example/-/ping",
		"https://slow.example/timestamp.json",
	]);
	assert.deepEqual(
		access.map(({ url, reachable, detail }) => ({ url, reachable, detail })),
		[
			{ url: "https://ok.example", reachable: true, detail: "HTTP 200" },
			{ url: "https://denied.example", reachable: false, detail: "HTTP 403" },
			{ url: "https://slow.example", reachable: false, detail: "timed out" },
			{ url: "https://missing.example", reachable: false, detail: "ENOTFOUND" },
		],
	);
	assert.deepEqual(formatEndpointAccess(access), [
		"  https://ok.example       reachable (HTTP 200)  metadata",
		"  https://denied.example   BLOCKED (HTTP 403)    metadata",
		"  https://slow.example     BLOCKED (timed out)   trust",
		"  https://missing.example  BLOCKED (ENOTFOUND)   metadata",
	]);
	// Only required endpoints stop the command.
	assert.deepEqual(
		findBlockedEndpoints(access).map(({ url }) => url),
		["https://slow.example", "https://missing.example"],
	);
});

test("treats redirects as blocked", async () => {
	const [access] = await probeEndpoints(
		[npmRegistryEndpoint("https://proxy.example", "metadata")],
		async () => new Response(null, { status: 302, headers: { location: "https://login" } }),
	);
	assert.equal(access?.reachable, false);
	assert.equal(access?.detail, "HTTP 302");
});

test("plans only the endpoints a mode needs as required, with public registries as information", () => {
	const plan = planEndpoints([
		npmRegistryEndpoint("https://registry.npmjs.org/", "package metadata"),
		sigstoreTufEndpoint("trusted root", true),
	]);
	assert.deepEqual(
		plan.map(({ url, required }) => [url, required]),
		[
			["https://registry.npmjs.org", true],
			["https://tuf-repo-cdn.sigstore.dev", true],
			["https://registry.yarnpkg.com", false],
			["https://registry.npmmirror.com", false],
		],
	);
	assert.deepEqual(
		planEndpoints([]).map(({ required }) => required),
		[false, false, false],
	);
	assert.equal(
		normalizeEndpointUrl("https://user:pass@mirror.example/npm/?q=1#x"),
		"https://mirror.example/npm",
	);
});

test("detects Azure Artifacts feeds", () => {
	for (const feed of [
		"https://pkgs.dev.azure.com/org/_packaging/feed/npm/registry/",
		"https://pkgs.dev.azure.com/org/project/_packaging/feed/npm/registry/",
		"https://contoso.pkgs.visualstudio.com/_packaging/feed/npm/registry/",
		"https://tfs.contoso.com/tfs/DefaultCollection/_packaging/feed/npm/registry/",
	]) {
		assert.equal(isAzureArtifactsRegistry(feed), true, feed);
	}
	for (const registry of [
		"https://registry.npmjs.org/",
		"https://registry.yarnpkg.com",
		"https://npm.pkg.github.com",
		"not a url",
	]) {
		assert.equal(isAzureArtifactsRegistry(registry), false, registry);
	}
});

test("extracts registries from pnpm config without exposing credentials", () => {
	const config = parseRegistryConfig(
		JSON.stringify({
			registry: "https://registry.npmjs.org/",
			"@scope:registry": "https://contoso.pkgs.visualstudio.com/_packaging/f/npm/registry/",
			"//contoso.pkgs.visualstudio.com/_packaging/f/npm/registry/:_password": "secret",
			"trust-policy": "no-downgrade",
		}),
	);
	assert.equal(config.registry, "https://registry.npmjs.org/");
	assert.deepEqual(
		[...config.scoped],
		[["@scope", "https://contoso.pkgs.visualstudio.com/_packaging/f/npm/registry/"]],
	);
	assert.equal(parseRegistryConfig("{}").registry, undefined);
	assert.throws(() => parseRegistryConfig("secret"), /did not return JSON/);
	assert.equal(
		redactRegistry("https://user:secret@pkgs.dev.azure.com/o/_packaging/f/npm/registry/"),
		"https://pkgs.dev.azure.com/o/_packaging/f/npm/registry/",
	);
});
