/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createFromCursor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/create.js";

import { SchemaFactory } from "../../../simple-tree/index.js";
import { validateUsageError } from "../../utils.js";
import { singleJsonCursor } from "../../json/index.js";

describe("simple-tree create", () => {
	describe("createFromCursor", () => {
		it("Success", () => {
			const cursor = singleJsonCursor("Hello world");
			createFromCursor(SchemaFactory.string, cursor);
		});

		it("Failure", () => {
			const cursor = singleJsonCursor("Hello world");
			assert.throws(
				() => createFromCursor(SchemaFactory.number, cursor),
				validateUsageError(/does not conform to schema/),
			);
		});
	});
});
