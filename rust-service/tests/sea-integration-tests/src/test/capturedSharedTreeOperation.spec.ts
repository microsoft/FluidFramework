/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "mocha";

import {
	capturedSharedTreeOperation,
	sharedTreeOperationForValue,
} from "../capturedSharedTreeOperation.js";

describe("Captured SharedTree operations", () => {
	it("preserves the representative payload shape", () => {
		const serialized = JSON.stringify(capturedSharedTreeOperation);
		assert.equal(Buffer.byteLength(serialized), 468);
		assert.match(serialized, /ModularEditBuilder\.Generic/u);
		assert.match(serialized, /com\.fluidframework\.leaf\.number/u);
	});

	it("varies revision and value without mutating the capture", () => {
		const operation = sharedTreeOperationForValue(6);
		assert.equal(operation.revision, 6);
		assert.equal(operation.changeset[0]?.data.maxId, 17);
		assert.deepEqual(
			operation.changeset[0]?.data.changes[0]?.change[0]?.[1].fieldChanges[0]?.change.r,
			{ e: false, d: 16, s: 15 },
		);
		assert.equal(operation.changeset[0]?.data.builds.trees.data[0]?.[1], 6);
		assert.equal(capturedSharedTreeOperation.revision, 0);
		assert.equal(capturedSharedTreeOperation.changeset[0]?.data.builds.trees.data[0]?.[1], 0);
	});
});
