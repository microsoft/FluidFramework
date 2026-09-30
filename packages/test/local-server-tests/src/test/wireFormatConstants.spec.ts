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
 * imports both copies and asserts they match
 *
 * Ideally these never change, if they do great care will be needed
 * to preserve the correctness of the container-loader code that uses them.
 */
describe("wireFormatConstants contract", () => {
	it("matches container-runtime and runtime-definitions values", () => {
		assert.deepStrictEqual(wireFormatConstants, {
			blobsTreeName,
			redirectTableBlobName,
			blobManagerBasePath,
			gcTreeKey,
			gcBlobPrefix,
			gcTombstoneBlobKey,
			gcDeletedBlobKey,
		});
	});
});
