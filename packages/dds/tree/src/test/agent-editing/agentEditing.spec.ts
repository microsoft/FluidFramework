/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { hydrate } from "../simple-tree/utils.js";
import { toDecoratedJson } from "../../agent-editing/index.js";

const sf = new SchemaFactory("agentSchema");

class Vector extends sf.object("Vector", {
	id: sf.identifier, // will be omitted from the generated JSON schema
	x: sf.number,
	y: sf.number,
	z: sf.optional(sf.number),
}) {}

class RootObject extends sf.object("RootObject", {
	str: sf.string,
	vectors: sf.array(Vector),
	bools: sf.array(sf.boolean),
}) {}

const config = new TreeViewConfiguration({ schema: [sf.number, RootObject] });

describe("toDecoratedJson", () => {
	it("adds ID fields", () => {
		const vector = new Vector({ id: "1", x: 1, y: 2 });
		const hydratedObject = hydrate(Vector, vector);
		assert.equal(
			toDecoratedJson(hydratedObject),
			JSON.stringify({
				__fluid_id: 0,
				id: "1",
				x: 1,
				y: 2,
			}),
		);
	});
});
