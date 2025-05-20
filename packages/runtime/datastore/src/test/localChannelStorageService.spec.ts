/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { FileMode, ITree, TreeEntry } from "@fluidframework/driver-definitions/internal";

import { LocalChannelStorageService } from "../localChannelStorageService.js";

describe("LocalChannelStorageService", () => {
	it("Empty Tree", async () => {
		const tree: ITree = {
			entries: [],
		};

		const ss = new LocalChannelStorageService(tree);

		assert.strictEqual(await ss.contains("/"), false);
		assert.deepStrictEqual(await ss.list(""), []);
		try {
			await ss.readBlob("test");
		} catch (error: unknown) {
			assert.strictEqual((error as Error).message, "Blob Not Found");
		}
	});

	it("Top Level Blob", async () => {
		const tree: ITree = {
			entries: [
				{
					mode: FileMode.File,
					path: "foo",
					type: TreeEntry.Blob,
					value: {
						// eslint-disable-next-line unicorn/text-encoding-identifier-case -- `utf8` not supported by this API
						encoding: "utf-8",
						contents: "bar",
					},
				},
			],
		};

		const ss = new LocalChannelStorageService(tree);

		assert.strictEqual(await ss.contains("foo"), true);
		assert.deepStrictEqual(await ss.list(""), ["foo"]);
		assert.deepStrictEqual(await ss.readBlob("foo"), stringToBuffer("bar", "utf8"));
	});

	it("Nested Blob", async () => {
		const tree: ITree = {
			entries: [
				{
					mode: FileMode.File,
					path: "nested",
					type: TreeEntry.Tree,
					value: {
						entries: [
							{
								mode: FileMode.File,
								path: "foo",
								type: TreeEntry.Blob,
								value: {
									// eslint-disable-next-line unicorn/text-encoding-identifier-case -- `utf8` not supported by this API
									encoding: "utf-8",
									contents: "bar",
								},
							},
						],
					},
				},
			],
		};
		const ss = new LocalChannelStorageService(tree);

		assert.strictEqual(await ss.contains("nested/foo"), true);
		assert.deepStrictEqual(await ss.list("nested/"), ["foo"]);
		assert.deepStrictEqual(await ss.readBlob("nested/foo"), stringToBuffer("bar", "utf8"));
	});
});
