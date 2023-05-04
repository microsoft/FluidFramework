/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation */
import { strict as assert } from "assert";
import { ISummaryTree } from "@fluidframework/protocol-definitions";

/**
 * This function clones the imported summary and returns a new summary with the same content.
 */
function cloneSummary(): ISummaryTree {
	return JSON.parse(JSON.stringify(summaryTemplate)) as ISummaryTree;
}

/**
 * This method generates the summary with the given content size. At first it clones the summary
 * template, then it generates the content with the given size by loop, which will
 * use repeated sequence from 0 to 10 to generate the content until the content size is achieved.
 * The content is stored in the header of the summary.
 * @param contentSize - The size of the content to be generated.
 */
function generateSummaryWithContent(contentSize: number) {
	const summary = cloneSummary();
	const content = (
		(
			((summary.tree[".channels"] as ISummaryTree).tree.rootDOId as ISummaryTree).tree[
				".channels"
			] as ISummaryTree
		).tree["de68ca53-be31-479e-8d34-a267958997e4"] as ISummaryTree
	).tree.header["content"];
	let contentString = "";
	while (contentString.length < contentSize) {
		if (contentString.length + 10 > contentSize) {
			contentString += "0123456789".substring(0, contentSize - contentString.length);
			break;
		} else {
			contentString += "0123456789";
		}
	}
	content.value = contentString;
	return summary;
}

describe("Summary Compression test", () => {
	it("Should succeed at first time", async () => {
		const summary = generateSummaryWithContent(1000000);
		const content = (
			(
				((summary.tree[".channels"] as ISummaryTree).tree.rootDOId as ISummaryTree).tree[
					".channels"
				] as ISummaryTree
			).tree["de68ca53-be31-479e-8d34-a267958997e4"] as ISummaryTree
		).tree.header["content"];
		assert(content.value.length === 1000001, "The content size should be 1000000");
	});
});

const summaryTemplate = {
	type: 1,
	tree: {
		".channels": {
			type: 1,
			tree: {
				rootDOId: {
					type: 1,
					tree: {
						".channels": {
							type: 1,
							tree: {
								"de68ca53-be31-479e-8d34-a267958997e4": {
									type: 1,
									tree: {
										"header": {
											type: 2,
											content: '{"value":"123"}',
										},
										".attributes": {
											type: 2,
											content:
												'{"type":"https://graph.microsoft.com/types/cell","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-internal.4.2.0"}',
										},
									},
								},
								"root": {
									type: 1,
									tree: {
										"header": {
											type: 2,
											content:
												'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":-1,"ccIds":["detached"]},"storage":{"tree":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/de68ca53-be31-479e-8d34-a267958997e4"}}}}}}}',
										},
										".attributes": {
											type: 2,
											content:
												'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-internal.4.2.0"}',
										},
									},
								},
							},
						},
						".component": {
							type: 2,
							content:
								'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
						},
					},
				},
			},
		},
		".metadata": {
			type: 2,
			content:
				'{"createContainerRuntimeVersion":"2.0.0-internal.4.2.0","createContainerTimestamp":1683180222333,"summaryNumber":2,"summaryFormatVersion":1,"gcFeature":2,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"sweepTimeoutMs":3110400000,"message":{"clientId":null,"clientSequenceNumber":-1,"minimumSequenceNumber":5,"referenceSequenceNumber":-1,"sequenceNumber":7,"timestamp":1683180249726,"type":"join"},"telemetryDocumentId":"72d29676-b076-43e8-80aa-b8fc7aba1506"}',
		},
		".electedSummarizer": {
			type: 2,
			content:
				'{"electedClientId":"f3bda689-ca40-4b68-b2ea-4c02dac76206","electedParentId":"af12d248-f040-413c-a6d1-8e5bd6619313","electionSequenceNumber":7}',
		},
		"gc": {
			type: 1,
			tree: {
				__gc_root: {
					type: 2,
					content:
						'{"gcNodes":{"/":{"outboundRoutes":["/rootDOId"]},"/rootDOId":{"outboundRoutes":["/rootDOId/de68ca53-be31-479e-8d34-a267958997e4","/rootDOId/root"]},"/rootDOId/de68ca53-be31-479e-8d34-a267958997e4":{"outboundRoutes":["/rootDOId"]},"/rootDOId/root":{"outboundRoutes":["/rootDOId","/rootDOId/de68ca53-be31-479e-8d34-a267958997e4"]}}}',
				},
			},
		},
	},
};
