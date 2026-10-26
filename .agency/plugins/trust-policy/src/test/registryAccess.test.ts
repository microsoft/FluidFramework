/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	describeUnreachableEndpoints,
	formatEndpointAccess,
	isAzureArtifactsRegistry,
	normalizeEndpointUrl,
	npmRegistryEndpoint,
	probeEndpoints,
	sigstoreTufEndpoint,
} from "../registryAccess.js";

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
			npmRegistryEndpoint("https://denied.example", "metadata"),
			{
				url: "https://slow.example",
				probePath: "/timestamp.json",
				purpose: "trust",
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
		"  https://ok.example       reachable (HTTP 200)     metadata",
		"  https://denied.example   UNREACHABLE (HTTP 403)   metadata",
		"  https://slow.example     UNREACHABLE (timed out)  trust",
		"  https://missing.example  UNREACHABLE (ENOTFOUND)  metadata",
	]);
});

test("describes unreachable endpoints as a warning that lets the check continue", () => {
	const reachable = { ...sigstoreTufEndpoint("trust"), reachable: true, detail: "HTTP 200" };
	assert.equal(describeUnreachableEndpoints([reachable]), undefined);
	const warning = describeUnreachableEndpoints([
		{
			...npmRegistryEndpoint("https://mirror.example/", "metadata"),
			reachable: false,
			detail: "HTTP 404",
		},
		reachable,
	]);
	assert.match(
		warning ?? "",
		/https:\/\/mirror\.example did not respond to its probe \(HTTP 404\)/,
	);
	assert.doesNotMatch(warning ?? "", /tuf-repo-cdn/);
	assert.match(warning ?? "", /Continuing/);
});

test("treats redirects as unreachable", async () => {
	const [access] = await probeEndpoints(
		[npmRegistryEndpoint("https://proxy.example", "metadata")],
		async () => new Response(null, { status: 302, headers: { location: "https://login" } }),
	);
	assert.equal(access?.reachable, false);
	assert.equal(access?.detail, "HTTP 302");
});

test("normalizes endpoint URLs", () => {
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
