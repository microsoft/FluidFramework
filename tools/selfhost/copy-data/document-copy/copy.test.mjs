import assert from "node:assert/strict";
import test from "node:test";
import { transferDocument } from "./copy.mjs";

function jsonResponse(value, status = 200) {
	return { status, json: async () => value };
}

test("transfers the latest source summary through the target document API", async () => {
	const requests = [];
	const fetchImplementation = async (url, options) => {
		requests.push({ url, options });
		if (url.includes("/session/")) return jsonResponse({ historianUrl: "https://source-historian.example" });
		if (url.endsWith("/git/refs/heads%2Fsource-document")) return jsonResponse({ object: { sha: "commit" } });
		if (url.includes("/git/summaries/")) return jsonResponse({
			trees: [{ entries: [
				{ path: ".app", type: "tree" },
				{ path: ".app/state", type: "blob", id: "state" },
				{ path: ".app/empty", type: "tree" },
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
		return jsonResponse({ id: "target-document" }, 201);
	};

	const targetDocumentId = await transferDocument({
		sourceEndpoint: "https://source.example",
		sourceTenantId: "source",
		targetEndpoint: "https://target-alfred.example",
		targetTenantId: "target",
		documentId: "source-document",
		sourceKey: "source-key",
		targetKey: "target-key",
		fetchImplementation,
	});

	assert.equal(targetDocumentId, "target-document");
	assert.equal(requests[1].url, "https://source-historian.example/repos/source/git/refs/heads%2Fsource-document");
	const createRequest = requests.at(-1);
	assert.equal(createRequest.url, "https://target-alfred.example/documents/target");
	assert.ok(createRequest.options.headers.Authorization.startsWith("Basic "));
	const body = JSON.parse(createRequest.options.body);
	assert.equal(body.id, "source-document");
	assert.equal(body.sequenceNumber, 5);
	assert.deepEqual(body.summary, {
		type: "tree",
		entries: [
			{ path: "state", type: "blob", value: { type: "blob", content: "state", encoding: "utf-8" } },
			{ path: "empty", type: "tree", value: { type: "tree", entries: [] } },
		],
	});
});
