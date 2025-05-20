/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createFromInsertable,
	cursorFromInsertable,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/create.js";

import { TreeAlpha } from "../../../shared-tree/index.js";
import { SchemaFactory } from "../../../simple-tree/index.js";
import { MockNodeIdentifierManager } from "../../../feature-libraries/index.js";
import { validateUsageError } from "../../utils.js";

const schema = new SchemaFactory("com.example");

class NodeMap extends schema.map("NoteMap", schema.string) {}
class NodeList extends schema.array("NoteList", schema.string) {}
class Canvas extends schema.object("Canvas", { stuff: [NodeMap, NodeList] }) {}

describe("simple-tree create", () => {
	it("createFromInsertable", () => {
		const canvas1 = createFromInsertable(Canvas, { stuff: [] });
		const canvas2 = createFromInsertable(Canvas, new Canvas({ stuff: [] }));
		const canvas3 = new Canvas({ stuff: [] });
		assert.deepEqual(canvas1, canvas2);
		assert.deepEqual(canvas1, canvas3);
	});

	it("createFromVerbose", () => {
		const canvas1 = TreeAlpha.importVerbose(Canvas, {
			type: Canvas.identifier,
			fields: { stuff: { type: NodeList.identifier, fields: [] } },
		});
		const canvas2 = new Canvas({ stuff: [] });
		assert.deepEqual(canvas1, canvas2);
	});

	describe("cursorFromInsertable", () => {
		it("Success", () => {
			cursorFromInsertable(schema.string, "Hello world", new MockNodeIdentifierManager());
		});

		it("Failure", () => {
			assert.throws(
				() =>
					cursorFromInsertable(
						schema.number,
						// @ts-expect-error invalid data for schema
						"Hello world",
						new MockNodeIdentifierManager(),
					),
				validateUsageError(/incompatible/),
			);
		});
	});
});
