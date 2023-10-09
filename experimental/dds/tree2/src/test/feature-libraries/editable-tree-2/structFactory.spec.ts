/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { leaf as leafDomain } from "../../../domains";
import { SchemaBuilder } from "../../../feature-libraries";
import {
	boxedIterator,
	createRawStruct,
	rawStructErrorMessage,
} from "../../../feature-libraries/editable-tree-2";
import { brand } from "../../../util";
import { contextWithContentReadonly } from "./utils";

describe("raw structs", () => {
	function getRawStruct() {
		const builder = new SchemaBuilder("raw struct test", undefined, leafDomain.library);
		const structSchema = builder.struct("struct", {
			foo: SchemaBuilder.fieldRequired(leafDomain.number),
			bar: SchemaBuilder.fieldOptional(leafDomain.string),
			baz: SchemaBuilder.fieldSequence(leafDomain.boolean),
		});
		const rootFieldSchema = SchemaBuilder.fieldRequired(structSchema);
		const schema = builder.intoDocumentSchema(rootFieldSchema);
		const context = contextWithContentReadonly({
			schema,
			initialTree: { foo: 42, baz: [] },
		});

		assert(context.root.is(rootFieldSchema));

		let struct = context.root.content;
		// This assignment checks that the raw struct is assignable to the same type as the real struct
		struct = createRawStruct(structSchema);
		return { struct, structSchema };
	}

	it("allow reading schema data", () => {
		const { struct, structSchema } = getRawStruct();
		assert.equal(struct.schema, structSchema);
		assert.equal(struct.type, structSchema.name);
	});

	it("allow reading value", () => {
		const { struct } = getRawStruct();
		assert.equal(struct.value, undefined);
	});

	it("disallow reading most node properties", () => {
		const { struct, structSchema } = getRawStruct();
		assertThrowsRawNodeError(() => struct.context);
		assertThrowsRawNodeError(() => struct.parentField);
		assertThrowsRawNodeError(() => struct.tryGetField(brand("foo")));
		assertThrowsRawNodeError(() => struct[boxedIterator]());
		assertThrowsRawNodeError(() => struct.on("changing", () => {}));
		assertThrowsRawNodeError(() => struct.is(structSchema));
		assertThrowsRawNodeError(() => struct.treeStatus());
		assertThrowsRawNodeError(() => struct.localNodeKey);
	});

	it("disallow reading fields", () => {
		const { struct } = getRawStruct();
		assertThrowsRawNodeError(() => struct.foo);
		assertThrowsRawNodeError(() => struct.bar);
		assertThrowsRawNodeError(() => struct.baz);
	});

	it("disallow reading boxed fields", () => {
		const { struct } = getRawStruct();
		assertThrowsRawNodeError(() => struct.boxedFoo);
		assertThrowsRawNodeError(() => struct.boxedBar);
		assertThrowsRawNodeError(() => struct.boxedBaz);
	});

	function assertThrowsRawNodeError(f: () => void): void {
		assert.throws(f, (e: Error) => validateAssertionError(e, rawStructErrorMessage));
	}
});
