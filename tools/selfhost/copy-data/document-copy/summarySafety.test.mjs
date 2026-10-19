/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { copyDocument } from "./copy.mjs";

function tailSummary(operations, encoding = "utf-8", sequenceNumber = 0) {
	const content = typeof operations === "string" ? operations : JSON.stringify(operations);
	return {
		trees: [
			{
				entries: [
					{ path: ".app", type: "tree" },
					{ path: ".app/counter", type: "blob", id: "counter" },
					{ path: ".protocol/attributes", type: "blob", id: "attributes" },
					{ path: ".protocol/quorumValues", type: "blob", id: "values" },
					{ path: ".logTail", type: "tree" },
					{ path: ".logTail/logTail", type: "blob", id: "tail" },
				],
			},
		],
		blobs: [
			{ id: "counter", content: '{"value":0}', encoding: "utf-8" },
			{ id: "attributes", content: JSON.stringify({ sequenceNumber }), encoding: "utf-8" },
			{ id: "values", content: "[]", encoding: "utf-8" },
			{
				id: "tail",
				content: encoding === "base64" ? Buffer.from(content).toString("base64") : content,
				encoding,
			},
		],
	};
}

function copySummary(summary, requests) {
	const response = (value, status = 200) => ({ status, json: async () => value });
	return copyDocument({
		azureFluidRelayEndpoint: "https://discovery.example",
		azureFluidRelayTenantId: "source",
		selfHostEndpoint: "https://alfred.example",
		selfHostTenantId: "destination",
		documentId: "document",
		azureFluidRelayKey: "source-test-key",
		selfHostKey: "destination-test-key",
		fetchImplementation: async (url, options) => {
			requests.push({ url, options });
			if (url.includes("/session/"))
				return response({ historianUrl: "https://historian.example" });
			if (url.includes("/git/refs/")) return response({ object: { sha: "latest" } });
			if (url.includes("/git/summaries/")) return response(summary);
			return response({ id: "document" }, 201);
		},
	});
}

test("rejects all four observed unsummarized counter cases before creating destination documents", async () => {
	for (const incrementAmount of [4, 27, 32, 14]) {
		for (const encoding of ["utf-8", "base64"]) {
			const requests = [];
			await assert.rejects(
				copySummary(
					tailSummary(
						[
							{
								sequenceNumber: 1,
								type: "op",
								contents: { type: "increment", incrementAmount },
							},
						],
						encoding,
					),
					requests,
				),
				/Copy refused.*not incorporated/,
			);
			assert.equal(
				requests.some((request) => request.options.method === "POST"),
				false,
			);
		}
	}
});

test("allows protocol-only tails associated with acknowledged client summaries", async () => {
	const requests = [];
	await copySummary(
		tailSummary(
			[
				{ sequenceNumber: 6, type: "summarize" },
				{ sequenceNumber: 7, type: "summaryAck" },
				{ sequenceNumber: 8, type: "join" },
				{ sequenceNumber: 9, type: "noop" },
				{ sequenceNumber: 10, type: "leave" },
				{ sequenceNumber: 11, type: "noClient" },
			],
			"utf-8",
			5,
		),
		requests,
	);
	assert.equal(requests.at(-1).options.method, "POST");
	assert.equal(JSON.parse(requests.at(-1).options.body).sequenceNumber, 5);
});

test("does not reject operations already covered by the application snapshot", async () => {
	const requests = [];
	await copySummary(tailSummary([{ sequenceNumber: 5, type: "op" }], "utf-8", 5), requests);
	assert.equal(requests.at(-1).options.method, "POST");
});

test("rejects malformed, incomplete, or unknown operation tails without writes", async () => {
	const missing = tailSummary([]);
	missing.blobs = missing.blobs.filter((blob) => blob.id !== "tail");
	for (const summary of [
		missing,
		tailSummary("not-json"),
		tailSummary("{}"),
		tailSummary([null]),
		tailSummary([{ sequenceNumber: -1, type: "op" }]),
		tailSummary([{ sequenceNumber: 1, type: "unknown-type" }]),
	]) {
		const requests = [];
		await assert.rejects(copySummary(summary, requests), { name: "CopyError" });
		assert.equal(
			requests.some((request) => request.options.method === "POST"),
			false,
		);
	}
});
