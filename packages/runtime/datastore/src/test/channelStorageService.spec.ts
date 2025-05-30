/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import {
	IDocumentStorageService,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { ChannelStorageService } from "../channelStorageService.js";

describe("ChannelStorageService", () => {
	it("Empty Tree", async () => {
		const tree: ISnapshotTree = {
			blobs: {},
			trees: {},
		};
		const storage: Pick<IDocumentStorageService, "readBlob"> = {
			readBlob: async (id: string) => {
				throw new Error("not implemented");
			},
		};
		const logger = new MockLogger();
		const ss = new ChannelStorageService(tree, storage, logger.toTelemetryLogger());

		assert.strictEqual(await ss.contains("/"), false);
		assert.deepStrictEqual(await ss.list(""), []);
		logger.assertMatchNone([{ category: "error" }]);
	});

	it("Top Level Blob", async () => {
		const tree: ISnapshotTree = {
			blobs: {
				foo: "bar",
			},
			trees: {},
		};
		const storage: Pick<IDocumentStorageService, "readBlob"> = {
			readBlob: async (id: string) => {
				return stringToBuffer(id, "utf8");
			},
		};
		const logger = new MockLogger();
		const ss = new ChannelStorageService(tree, storage, logger.toTelemetryLogger());

		assert.strictEqual(await ss.contains("foo"), true);
		assert.deepStrictEqual(await ss.list(""), ["foo"]);
		assert.deepStrictEqual(await ss.readBlob("foo"), stringToBuffer("bar", "utf8"));
		logger.assertMatchNone([{ category: "error" }]);
	});

	it("Nested Blob", async () => {
		const tree: ISnapshotTree = {
			blobs: {},
			trees: {
				nested: {
					blobs: {
						foo: "bar",
					},
					trees: {},
				},
			},
		};
		const storage: Pick<IDocumentStorageService, "readBlob"> = {
			readBlob: async (id: string) => {
				return stringToBuffer(id, "utf8");
			},
		};
		const logger = new MockLogger();
		const ss = new ChannelStorageService(tree, storage, logger.toTelemetryLogger());

		assert.strictEqual(await ss.contains("nested/foo"), true);
		assert.deepStrictEqual(await ss.list("nested/"), ["foo"]);
		assert.deepStrictEqual(await ss.readBlob("nested/foo"), stringToBuffer("bar", "utf8"));
		logger.assertMatchNone([{ category: "error" }]);
	});
});
