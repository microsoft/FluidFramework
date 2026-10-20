/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	findBlockedRegistry,
	formatRegistryAccess,
	probeRegistries,
} from "../registry-access.js";

test("classifies registry probe outcomes", async () => {
	const requested: string[] = [];
	const fakeFetch: typeof fetch = async (input) => {
		const url = String(input);
		requested.push(url);
		if (url.startsWith("https://ok.example")) return new Response("{}", { status: 200 });
		if (url.startsWith("https://denied.example")) return new Response("", { status: 403 });
		if (url.startsWith("https://slow.example"))
			throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
		throw new TypeError("fetch failed", {
			cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }),
		});
	};
	const access = await probeRegistries(
		[
			"https://ok.example",
			"https://denied.example",
			"https://slow.example",
			"https://missing.example",
		],
		fakeFetch,
	);
	assert.deepEqual(requested.sort(), [
		"https://denied.example/-/ping",
		"https://missing.example/-/ping",
		"https://ok.example/-/ping",
		"https://slow.example/-/ping",
	]);
	assert.deepEqual(access, [
		{ registry: "https://ok.example", reachable: true, detail: "HTTP 200" },
		{ registry: "https://denied.example", reachable: false, detail: "HTTP 403" },
		{ registry: "https://slow.example", reachable: false, detail: "timed out" },
		{ registry: "https://missing.example", reachable: false, detail: "ENOTFOUND" },
	]);
	assert.deepEqual(formatRegistryAccess(access), [
		"  https://ok.example       reachable (HTTP 200)",
		"  https://denied.example   BLOCKED (HTTP 403)",
		"  https://slow.example     BLOCKED (timed out)",
		"  https://missing.example  BLOCKED (ENOTFOUND)",
	]);
});

test("treats redirects as blocked", async () => {
	const access = await probeRegistries(
		["https://proxy.example"],
		async () => new Response(null, { status: 302, headers: { location: "https://login" } }),
	);
	assert.deepEqual(access, [
		{ registry: "https://proxy.example", reachable: false, detail: "HTTP 302" },
	]);
});

test("matches the registry in use by origin", () => {
	const access = [
		{ registry: "https://registry.npmjs.org", reachable: false, detail: "HTTP 403" },
		{ registry: "https://registry.yarnpkg.com", reachable: true, detail: "HTTP 200" },
	];
	assert.equal(findBlockedRegistry("https://registry.npmjs.org/", access)?.detail, "HTTP 403");
	assert.equal(findBlockedRegistry("https://registry.yarnpkg.com/", access), undefined);
	assert.equal(findBlockedRegistry("https://mirror.example/npm/", access), undefined);
	assert.equal(findBlockedRegistry("not a url", access), undefined);
});
