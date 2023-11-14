/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file contains several lambdas that do a simple property access
/* eslint-disable import/no-internal-modules */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { leaf, SchemaBuilder } from "../../../domains";
import { boxedIterator } from "../../../feature-libraries/flex-tree";
import {
	createRawObjectNode,
	extractRawNodeContent,
	rawObjectErrorMessage,
} from "../../../feature-libraries/simple-tree/rawObjectNode";
import { brand } from "../../../util";
import { contextWithContentReadonly } from "../flex-tree/utils";

describe("raw object nodes", () => {
	function getRawObjectNode() {
		const builder = new SchemaBuilder({ scope: "raw object test" });
		const objectSchema = builder.object("object", {
			foo: leaf.number,
			bar: builder.optional(leaf.string),
			baz: builder.sequence(leaf.boolean),
		});
		const rootFieldSchema = SchemaBuilder.required(objectSchema);
		const schema = builder.intoSchema(rootFieldSchema);
		const context = contextWithContentReadonly({
			schema,
			initialTree: { foo: 42, baz: [] },
		});

		assert(context.root.is(rootFieldSchema));
		let node = context.root.content;
		const rawObjectNode = createRawObjectNode(objectSchema, {
			foo: 42,
			bar: undefined,
			baz: [],
		});
		// This assignment checks that the raw node is assignable to the same type as the real node
		node = rawObjectNode;
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
		assertThrowsRawNodeError(() => rawObjectNode.context);
		assertThrowsRawNodeError(() => rawObjectNode.parentField);
		assertThrowsRawNodeError(() => rawObjectNode.tryGetField(brand("foo")));
		assertThrowsRawNodeError(() => rawObjectNode[boxedIterator]());
		assertThrowsRawNodeError(() => rawObjectNode.on("changing", () => {}));
		assertThrowsRawNodeError(() => rawObjectNode.is(objectSchema));
		assertThrowsRawNodeError(() => rawObjectNode.treeStatus());
		assertThrowsRawNodeError(() => rawObjectNode.localNodeKey);
	});

	it("disallow reading fields", () => {
		const { rawObjectNode } = getRawObjectNode();
		assertThrowsRawNodeError(() => rawObjectNode.foo);
		assertThrowsRawNodeError(() => rawObjectNode.bar);
		assertThrowsRawNodeError(() => rawObjectNode.baz);
	});

	it("disallow reading boxed fields", () => {
		const { rawObjectNode } = getRawObjectNode();
		assertThrowsRawNodeError(() => rawObjectNode.boxedFoo);
		assertThrowsRawNodeError(() => rawObjectNode.boxedBar);
		assertThrowsRawNodeError(() => rawObjectNode.boxedBaz);
	});

	it("expose their contents", () => {
		const { rawObjectNode } = getRawObjectNode();
		assert.equal(extractRawNodeContent(rawObjectNode)?.foo, 42);
	});

	it("can only have their contents read once", () => {
		const { rawObjectNode } = getRawObjectNode();
		assert.notEqual(extractRawNodeContent(rawObjectNode), undefined);
		assert.equal(extractRawNodeContent(rawObjectNode), undefined);
	});

	function assertThrowsRawNodeError(f: () => void): void {
		assert.throws(f, (e: Error) => validateAssertionError(e, rawObjectErrorMessage));
	}
});
