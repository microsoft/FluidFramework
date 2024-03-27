/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file contains several lambdas that do a simple property access
/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";
import { leaf } from "../../domains/index.js";
import {
	FieldKinds,
	FlexFieldSchema,
	FlexObjectNodeSchema,
	SchemaBuilderBase,
} from "../../feature-libraries/index.js";
import { RawObjectNode, extractRawNodeContent } from "../../simple-tree/rawNode.js";
import { brand } from "../../util/index.js";
import { contextWithContentReadonly } from "../feature-libraries/flex-tree/utils.js";

describe("raw object nodes", () => {
	function getRawObjectNode() {
		const builder = new SchemaBuilderBase(FieldKinds.required, {
			scope: "raw object test",
			libraries: [leaf.library],
		});
		const objectSchema = builder.object("object", {
			foo: leaf.number,
			bar: FlexFieldSchema.create(FieldKinds.optional, [leaf.string]),
			baz: FlexFieldSchema.create(FieldKinds.sequence, [leaf.boolean]),
		});
		const rootFieldSchema = FlexFieldSchema.create(FieldKinds.required, [objectSchema]);
		const schema = builder.intoSchema(rootFieldSchema);
		const context = contextWithContentReadonly({
			schema,
			initialTree: { foo: 42, baz: [] },
		});

		assert(context.root.is(rootFieldSchema));
		const rawObjectNode = new RawObjectNode(objectSchema as FlexObjectNodeSchema, {
			foo: 42,
			bar: undefined,
			baz: [],
		});
		return { rawObjectNode, objectSchema };
	}

	it("allow reading schema data", () => {
		const { rawObjectNode, objectSchema } = getRawObjectNode();
		assert.equal(rawObjectNode.schema, objectSchema);
		assert.equal(rawObjectNode.type, objectSchema.name);
	});

	it("allow reading value", () => {
		const { rawObjectNode } = getRawObjectNode();
		assert.equal(rawObjectNode.value, undefined);
	});

	it("disallow reading most node properties", () => {
		const { rawObjectNode, objectSchema } = getRawObjectNode();
		assert.throws(() => rawObjectNode.context);
		assert.throws(() => rawObjectNode.parentField);
		assert.throws(() => rawObjectNode.tryGetField(brand("foo")));
		assert.throws(() => rawObjectNode.boxedIterator());
		assert.throws(() => rawObjectNode.on("changing", () => {}));
		assert.throws(() => rawObjectNode.treeStatus());
		assert.throws(() => rawObjectNode.localNodeKey);
	});

	it("disallow reading fields", () => {
		const { rawObjectNode } = getRawObjectNode();
		assert.throws(() => rawObjectNode.tryGetField(brand("foo")));
		assert.throws(() => rawObjectNode.tryGetField(brand("bar")));
		assert.throws(() => rawObjectNode.tryGetField(brand("baz")));
	});

	it("expose their contents", () => {
		const { rawObjectNode } = getRawObjectNode();
		assert.equal((extractRawNodeContent(rawObjectNode) as Record<string, unknown>)?.foo, 42);
	});

	it("can only have their contents read once", () => {
		const { rawObjectNode } = getRawObjectNode();
		assert.notEqual(extractRawNodeContent(rawObjectNode), undefined);
		assert.throws(() => extractRawNodeContent(rawObjectNode));
	});
});
