/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";

import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import {
	IWholeFlatSnapshot,
	IWholeFlatSnapshotBlob,
	IWholeFlatSnapshotTreeEntry,
} from "../contracts.js";
import { IR11sResponse } from "../restWrapper.js";
import { WholeSummaryDocumentStorageService } from "../wholeSummaryDocumentStorageService.js";

/* Blobs contained within source snapshot tree returned by git manager */
const summaryBlobs: IWholeFlatSnapshotBlob[] = [
	{
		id: "bARCTBK4PQiMLVK2gR5hPRkId",
		content: "[]",
		encoding: "utf-8",
		size: 2,
	},
	{
		id: "bARCfbIYtOyFwf1+nY75C4UFc",
		content:
			'{"createContainerRuntimeVersion":"0.59.1000","createContainerTimestamp":1651351060440,"summaryFormatVersion":1,"gcFeature":0}',
		encoding: "utf-8",
		size: 125,
	},
	{
		id: "bARAL2CXvHYOch_aQtJAJOker",
		content:
			'[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]',
		encoding: "utf-8",
		size: 149,
	},
];

/* Tree entries contained within source snapshot tree returned by git manager */
const treeEntries: IWholeFlatSnapshotTreeEntry[] = [
	{
		path: ".protocol",
		type: "tree",
	},
	{
		id: "bARCTBK4PQiMLVK2gR5hPRkId",
		path: ".protocol/attributes",
		type: "blob",
	},
	{
		id: "bARAL2CXvHYOch_aQtJAJOker",
		path: ".protocol/quorumValues",
		type: "blob",
	},
	{
		path: ".app",
		type: "tree",
	},
	{
		path: ".app/.channels",
		type: "tree",
	},
	{
		path: ".app/.channels/rootDOId",
		type: "tree",
	},
	{
		id: "bARCfbIYtOyFwf1+nY75C4UFc",
		path: ".app/.metadata",
		type: "blob",
	},
];

/* Source snapshot returned by git manager */
const flatSnapshot: IWholeFlatSnapshot = {
	id: "bBwAAAAAHAAAA",
	trees: [
		{
			id: "bBwAAAAAHAAAA",
			sequenceNumber: 0,
			entries: treeEntries,
		},
	],
	blobs: summaryBlobs,
};

/* Expoected summary to be returned by downloadSummary */
const expectedSummary: ISummaryTree = {
	tree: {
		".app": {
			tree: {
				".channels": {
					tree: {
						rootDOId: {
							tree: {},
							type: 1,
							unreferenced: undefined,
							groupId: undefined,
						},
					},
					type: 1,
					unreferenced: undefined,
					groupId: undefined,
				},
				".metadata": {
					content:
						'{"createContainerRuntimeVersion":"0.59.1000","createContainerTimestamp":1651351060440,"summaryFormatVersion":1,"gcFeature":0}',
					type: 2,
				},
			},
			type: 1,
			unreferenced: undefined,
			groupId: undefined,
		},
		".protocol": {
			tree: {
				attributes: {
					content: "[]",
					type: 2,
				},
				quorumValues: {
					content:
						'[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]',
					type: 2,
				},
			},
			type: 1,
			unreferenced: undefined,
			groupId: undefined,
		},
	},
	type: 1,
	unreferenced: undefined,
	groupId: undefined,
};

class MockGitManager {
	public async getSnapshot(sha: string): Promise<IR11sResponse<IWholeFlatSnapshot>> {
		return {
			content: flatSnapshot,
			headers: new Map(),
			propsToLog: {},
			requestUrl: "",
		};
	}
}

describe("WholeSummaryDocumentStorageService", () => {
	it("downloads summaries in expected format", async () => {
		const service = new WholeSummaryDocumentStorageService(
			"id",
			new MockGitManager() as any,
			createChildLogger({ namespace: "fluid:testSummaries" }),
			{},
		);

		const res = await service.downloadSummary({
			type: SummaryType.Handle,
			handleType: SummaryType.Tree,
			handle: "testHandle",
		});
		assert.deepStrictEqual(res, expectedSummary, "Unexpected summary returned.");
	});
});
