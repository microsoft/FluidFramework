/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { wireFormatConstants } from "@fluidframework/container-loader/internal";
import {
	blobManagerBasePath,
	blobsTreeName,
	redirectTableBlobName,
} from "@fluidframework/container-runtime/internal";
import {
	gcBlobPrefix,
	gcDeletedBlobKey,
	gcTombstoneBlobKey,
	gcTreeKey,
} from "@fluidframework/runtime-definitions/internal";

/**
 * `container-loader` duplicates a handful of wire-format constants because the
 * authoritative definitions live in `container-runtime` and
 * `runtime-definitions`, which the loader cannot depend on. This contract test
 * imports both copies and asserts they match: if the runtime side ever
 * changes a value, this test fails and the duplication has to be updated in
 * lock-step.
 */
describe("wireFormatConstants contract", () => {
	it("blobsTreeName matches the container-runtime definition", () => {
		assert.strictEqual(wireFormatConstants.blobsTreeName, blobsTreeName);
	});

	it("redirectTableBlobName matches the container-runtime definition", () => {
		assert.strictEqual(wireFormatConstants.redirectTableBlobName, redirectTableBlobName);
	});

	it("blobManagerBasePath matches the container-runtime definition", () => {
		assert.strictEqual(wireFormatConstants.blobManagerBasePath, blobManagerBasePath);
	});

	it("gcTreeKey matches the runtime-definitions definition", () => {
		assert.strictEqual(wireFormatConstants.gcTreeKey, gcTreeKey);
	});

	it("gcBlobPrefix matches the runtime-definitions definition", () => {
		assert.strictEqual(wireFormatConstants.gcBlobPrefix, gcBlobPrefix);
	});

	it("gcTombstoneBlobKey matches the runtime-definitions definition", () => {
		assert.strictEqual(wireFormatConstants.gcTombstoneBlobKey, gcTombstoneBlobKey);
	});

	it("gcDeletedBlobKey matches the runtime-definitions definition", () => {
		assert.strictEqual(wireFormatConstants.gcDeletedBlobKey, gcDeletedBlobKey);
	});
});
