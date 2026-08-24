/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { wireFormatConstants } from "@fluidframework/container-loader/internal";
import {
	blobsTreeName,
	redirectTableBlobName,
} from "@fluidframework/container-runtime/internal";

/**
 * `container-loader` duplicates two wire-format constants because their
 * authoritative definitions live in `container-runtime`, which the loader
 * cannot depend on. This contract test imports both copies and asserts they
 * match.
 *
 * Ideally these never change, if they do great care will be needed
 * to preserve the correctness of the container-loader code that uses them.
 */
describe("wireFormatConstants contract", () => {
	it("matches container-runtime values", () => {
		assert.deepStrictEqual(wireFormatConstants, {
			blobsTreeName,
			redirectTableBlobName,
		});
	});
});
