/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file contains several lambdas that do a simple property access
/* eslint-disable import/no-internal-modules */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { leaf, SchemaBuilder } from "../../../domains";
import {
	boxedIterator,
	createRawObjectNode,
	nodeContent,
	rawObjectErrorMessage,
} from "../../../feature-libraries/editable-tree-2";
import { brand } from "../../../util";
import { contextWithContentReadonly } from "./utils";

describe("raw structs", () => {
	function getRawStruct() {
		const builder = new SchemaBuilder({ scope: "raw struct test" });
		const structSchema = builder.object("object", {
			foo: leaf.number,
			bar: builder.optional(leaf.string),
			baz: builder.sequence(leaf.boolean),
		});
		const rootFieldSchema = SchemaBuilder.required(structSchema);
		const schema = builder.intoSchema(rootFieldSchema);
		const context = contextWithContentReadonly({
			schema,
			initialTree: { foo: 42, baz: [] },
		});

		assert(context.root.is(rootFieldSchema));
		let struct = context.root.content;
		const rawStruct = createRawObjectNode(structSchema, { foo: 42, bar: undefined, baz: [] });
		// This assignment checks that the raw struct is assignable to the same type as the real struct
		struct = rawStruct;
		return { rawStruct, structSchema };
	}

	it("allow reading schema data", () => {
		const { rawStruct, structSchema } = getRawStruct();
		assert.equal(rawStruct.schema, structSchema);
		assert.equal(rawStruct.type, structSchema.name);
	});

	it("allow reading value", () => {
		const { rawStruct } = getRawStruct();
		assert.equal(rawStruct.value, undefined);
	});

	it("disallow reading most node properties", () => {
		const { rawStruct, structSchema } = getRawStruct();
		assertThrowsRawNodeError(() => rawStruct.context);
		assertThrowsRawNodeError(() => rawStruct.parentField);
		assertThrowsRawNodeError(() => rawStruct.tryGetField(brand("foo")));
		assertThrowsRawNodeError(() => rawStruct[boxedIterator]());
		assertThrowsRawNodeError(() => rawStruct.on("changing", () => {}));
		assertThrowsRawNodeError(() => rawStruct.is(structSchema));
		assertThrowsRawNodeError(() => rawStruct.treeStatus());
		assertThrowsRawNodeError(() => rawStruct.localNodeKey);
	});

	it("disallow reading fields", () => {
		const { rawStruct } = getRawStruct();
		assertThrowsRawNodeError(() => rawStruct.foo);
		assertThrowsRawNodeError(() => rawStruct.bar);
		assertThrowsRawNodeError(() => rawStruct.baz);
	});

	it("disallow reading boxed fields", () => {
		const { rawStruct } = getRawStruct();
		assertThrowsRawNodeError(() => rawStruct.boxedFoo);
		assertThrowsRawNodeError(() => rawStruct.boxedBar);
		assertThrowsRawNodeError(() => rawStruct.boxedBaz);
	});

	it("expose their contents", () => {
		const { rawStruct } = getRawStruct();
		assert.equal(rawStruct[nodeContent].foo, 42);
	});

	function assertThrowsRawNodeError(f: () => void): void {
		assert.throws(f, (e: Error) => validateAssertionError(e, rawObjectErrorMessage));
	}
});
