/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import { decodeNativeCheckpoint, encodeNativeCheckpoint } from "../nativeCheckpoint.js";

describe("Native checkpoint encoding", () => {
	it("round-trips binary blobs, text, attachment references and unreferenced trees", () => {
		const tree: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {
				text: { type: SummaryType.Blob, content: '{"binary":[256],"content":"user data"}' },
				binary: { type: SummaryType.Blob, content: new Uint8Array([0, 128, 255]) },
				image: { type: SummaryType.Attachment, id: "original-image-id" },
				unused: { type: SummaryType.Tree, unreferenced: true, tree: {} },
			},
		};
		assert.deepEqual(decodeNativeCheckpoint(encodeNativeCheckpoint(tree).buffer), tree);
	});

	it("rejects incremental handles and loading groups instead of losing content", () => {
		assert.throws(
			() =>
				encodeNativeCheckpoint({
					type: SummaryType.Tree,
					tree: {
						old: { type: SummaryType.Handle, handleType: SummaryType.Tree, handle: "/old" },
					},
				}),
			/summary handles/,
		);
		assert.throws(
			() =>
				encodeNativeCheckpoint({
					type: SummaryType.Tree,
					groupId: "unloaded",
					tree: {},
				}),
			/ungrouped/,
		);
	});

	it("rejects invalid binary bytes and unsupported formats", () => {
		for (const content of [
			{ version: 2, summary: {} },
			{ version: 1, summary: { type: SummaryType.Blob, binary: [-1] } },
			{ version: 1, summary: { type: SummaryType.Blob, binary: [1.5] } },
		]) {
			assert.throws(() =>
				decodeNativeCheckpoint(new TextEncoder().encode(JSON.stringify(content)).buffer),
			);
		}
	});
});
