/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SchemaBuilder, leaf } from "../../domains/index.js";
import {
	FieldKinds,
	FlexFieldSchema,
	type FlexTreeSequenceField,
	type FlexTreeTypedNode,
	schemaIsFieldNode,
} from "../../feature-libraries/index.js";
import type {
	areSafelyAssignable,
	isAny,
	requireFalse,
	requireTrue,
} from "../../util/index.js";

describe("domains - SchemaBuilder", () => {
	describe("list", () => {
		it("implicit normalizes", () => {
			const builder = new SchemaBuilder({ scope: "scope" });

			const list = builder.list("Foo", leaf.number);
			assert(schemaIsFieldNode(list));
			assert.equal(list.name, `scope.Foo`);
			assert(list.info.equals(FlexFieldSchema.create(FieldKinds.sequence, [leaf.number])));
			type List = FlexTreeTypedNode<typeof list>["content"];
			type _check = requireTrue<
				areSafelyAssignable<List, FlexTreeSequenceField<readonly [typeof leaf.number]>>
			>;

			// Creating again errors instead of reuses
			assert.throws(() => builder.list("Foo", leaf.number));
		});
	});

	it("object", () => {
		const builder = new SchemaBuilder({ scope: "Test Domain" });

		const testObject = builder.object("object", {
			number: leaf.number,
		});

		type _0 = requireFalse<isAny<typeof testObject>>;

		function typeTests(x: FlexTreeTypedNode<typeof testObject>) {
			const y: number = x.number;
		}
	});

	it("objectRecursive", () => {
		const builder = new SchemaBuilder({ scope: "Test Recursive Domain" });

		const recursiveObject = builder.objectRecursive("object", {
			recursive: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveObject]),
			number: SchemaBuilder.required(leaf.number),
		});

		type _0 = requireFalse<isAny<typeof recursiveObject>>;

		function typeTests2(x: FlexTreeTypedNode<typeof recursiveObject>) {
			const y: number = x.number;
			const z: number | undefined = x.recursive?.recursive?.number;
		}
	});
});
