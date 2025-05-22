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
import { borrowFieldCursorFromTreeNodeOrValue } from "../../../shared-tree/index.js";

const schema = new SchemaFactory("com.example");

class NodeMap extends schema.map("NoteMap", schema.string) {}
class NodeList extends schema.array("NoteList", schema.string) {}
class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

describe("simple-tree create", () => {
	describe("createFromCursor", () => {
		it("Success", () => {
			createFromCursor(schema.string, borrowFieldCursorFromTreeNodeOrValue("Hello world"));
		});

		it("Failure", () => {
			assert.throws(
				() =>
					createFromCursor(schema.number, borrowFieldCursorFromTreeNodeOrValue("Hello world")),
				validateUsageError(/incompatible/),
			);
		});

		it("empty", () => {
			createFromCursor(
				SchemaFactory.optional(SchemaFactory.string),
				borrowFieldCursorFromTreeNodeOrValue(undefined),
			);
		});
	});
});
