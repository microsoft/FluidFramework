/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { leaf } from "../../../domains/index.js";
import { FieldKinds } from "../../../feature-libraries/index.js";
import {
	FlexFieldSchema,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/typed-schema/typedTreeSchema.js";

import { SchemaFactory, getFlexSchema } from "../../../simple-tree/index.js";

describe("typedTreeSchema", () => {
	const builder = new SchemaFactory("test");
	const emptyObjectSchema = getFlexSchema(builder.object("empty", {}));
	const basicObjectSchema = getFlexSchema(
		builder.object("basicObject", { foo: builder.number }),
	);

	const recursiveObject = builder.objectRecursive("recursiveObject", {
		foo: builder.optionalRecursive([() => recursiveObject]),
	});

	it("schema is", () => {
		assert(schemaIsLeaf(leaf.boolean));
		assert(!schemaIsObjectNode(leaf.boolean));
		assert(!schemaIsMap(leaf.boolean));

		assert(!schemaIsLeaf(emptyObjectSchema));
		assert(schemaIsObjectNode(emptyObjectSchema));
		assert(!schemaIsMap(emptyObjectSchema));

		assert(!schemaIsLeaf(basicObjectSchema));
		assert(schemaIsObjectNode(basicObjectSchema));
		assert(!schemaIsMap(basicObjectSchema));
	});

	describe("TreeFieldSchema", () => {
		it("types - single", () => {
			const schema = FlexFieldSchema.create(FieldKinds.optional, [leaf.number]);
			assert.deepEqual(schema.allowedTypes, [leaf.number]);
			assert.deepEqual(schema.allowedTypeSet, new Set([leaf.number]));
			assert.deepEqual(schema.types, new Set([leaf.number.name]));
		});

		it("types - lazy", () => {
			const schema = FlexFieldSchema.create(FieldKinds.optional, [() => leaf.number]);
			assert.deepEqual(schema.allowedTypeSet, new Set([leaf.number]));
			assert.deepEqual(schema.types, new Set([leaf.number.name]));
		});
	});
});
