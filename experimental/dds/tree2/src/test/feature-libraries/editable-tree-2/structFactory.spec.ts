/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file contains several lambdas that do a simple property access
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable import/no-internal-modules */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { leaf } from "../../../domains";
import { SchemaBuilder } from "../../../feature-libraries";
import {
	boxedIterator,
	createRawStruct,
	nodeContent,
	rawStructErrorMessage,
} from "../../../feature-libraries/editable-tree-2";
import { brand } from "../../../util";
import { contextWithContentReadonly } from "./utils";

describe("raw structs", () => {
	function getRawStruct() {
		const builder = new SchemaBuilder({
			scope: "raw struct test",
			libraries: [leaf.library],
		});
		const structSchema = builder.struct("struct", {
			foo: leaf.number,
			bar: SchemaBuilder.fieldOptional(leaf.string),
			baz: SchemaBuilder.fieldSequence(leaf.boolean),
		});
		const rootFieldSchema = SchemaBuilder.fieldRequired(structSchema);
		const schema = builder.toDocumentSchema(rootFieldSchema);
		const context = contextWithContentReadonly({
			schema,
			initialTree: { foo: 42, baz: [] },
		});

		assert(context.root.is(rootFieldSchema));
		let struct = context.root.content;
		const rawStruct = createRawStruct(structSchema, { foo: 42, bar: undefined, baz: [] });
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
		assert.throws(f, (e: Error) => validateAssertionError(e, rawStructErrorMessage));
	}
});
