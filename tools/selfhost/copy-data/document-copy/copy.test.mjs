/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { copyDocument } from "./copy.mjs";

function jsonResponse(value, status = 200) {
	return { status, json: async () => value };
}

test("copies the latest Azure Fluid Relay summary through the self-host document API", async () => {
	const requests = [];
	const fetchImplementation = async (url, options) => {
		requests.push({ url, options });
		if (url.includes("/session/")) return jsonResponse({ historianUrl: "https://azure-fluid-relay-historian.example" });
		if (url.endsWith("/git/refs/heads%2Fazure-fluid-relay-document")) return jsonResponse({ object: { sha: "commit" } });
		if (url.includes("/git/summaries/")) return jsonResponse({
			trees: [{ entries: [
				{ path: ".app", type: "tree" },
				{ path: ".app/state", type: "blob", id: "state", unreferenced: true },
				{ path: ".app/empty", type: "tree", unreferenced: true },
				{ path: ".app/nested", type: "tree" },
				{ path: ".app/nested/child", type: "tree", unreferenced: true },
				{ path: ".protocol", type: "tree" },
				{ path: ".protocol/attributes", type: "blob", id: "attributes" },
				{ path: ".protocol/quorumValues", type: "blob", id: "values" },
			] }],
			blobs: [
				{ id: "state", content: "state", encoding: "utf-8" },
				{ id: "attributes", content: '{"sequenceNumber":5}', encoding: "utf-8" },
				{ id: "values", content: "[]", encoding: "utf-8" },
			],
		});
		return jsonResponse({ id: "self-host-document" }, 201);
	};

	const selfHostDocumentId = await copyDocument({
		azureFluidRelayEndpoint: "https://azure-fluid-relay.example",
		azureFluidRelayTenantId: "azure-fluid-relay",
		selfHostEndpoint: "https://self-host-alfred.example",
		selfHostTenantId: "self-host",
		documentId: "azure-fluid-relay-document",
		azureFluidRelayKey: "azure-fluid-relay-key",
		selfHostKey: "self-host-key",
		fetchImplementation,
	});

	assert.equal(selfHostDocumentId, "self-host-document");
	assert.equal(requests[1].url, "https://azure-fluid-relay-historian.example/repos/azure-fluid-relay/git/refs/heads%2Fazure-fluid-relay-document");
	const createRequest = requests.at(-1);
	assert.equal(createRequest.url, "https://self-host-alfred.example/documents/self-host");
	assert.ok(createRequest.options.headers.Authorization.startsWith("Basic "));
	const body = JSON.parse(createRequest.options.body);
	assert.equal(body.id, "azure-fluid-relay-document");
	assert.equal(body.sequenceNumber, 5);
	assert.deepEqual(body.summary, {
		type: "tree",
		entries: [
			{ path: "state", type: "blob", unreferenced: true, value: { type: "blob", content: "state", encoding: "utf-8" } },
			{ path: "empty", type: "tree", unreferenced: true, value: { type: "tree", entries: [] } },
			{ path: "nested", type: "tree", value: { type: "tree", entries: [{ path: "child", type: "tree", unreferenced: true, value: { type: "tree", entries: [] } }] } },
		],
	});
});
