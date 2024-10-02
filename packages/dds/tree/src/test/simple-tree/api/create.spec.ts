/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createFromInsertable, SchemaFactory } from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { createFromVerbose } from "../../../simple-tree/api/create.js";

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
		const canvas1 = createFromVerbose(Canvas, {
			type: Canvas.identifier,
			fields: { stuff: { type: NodeList.identifier, fields: [] } },
		});
		const canvas2 = new Canvas({ stuff: [] });
		assert.deepEqual(canvas1, canvas2);
	});
});
