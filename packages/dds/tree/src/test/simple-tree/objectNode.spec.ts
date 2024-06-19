/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { SchemaFactory } from "../../simple-tree/index.js";

import { hydrate } from "./utils.js";
import type { requireAssignableTo } from "../../util/index.js";

const schemaFactory = new SchemaFactory("Test");

describe("ObjectNode", () => {
	describe("shadowing", () => {
		it("optional shadowing builtin", () => {
			class Schema extends schemaFactory.object("x", {
				toString: schemaFactory.optional(schemaFactory.number),
			}) {}
			{
				const n = hydrate(Schema, { toString: 1 });
				assert.equal(n.toString, 1);
				n.toString = undefined;
				assert.equal(n.toString, undefined);
			}

			{
				const n = hydrate(Schema, { toString: undefined });
				const x = n.toString;
				assert.equal(x, undefined);
			}
		});

		it("optional incompatible shadowing", () => {
			class Schema extends schemaFactory.object("x", {
				foo: schemaFactory.optional(schemaFactory.number),
			}) {
				// @ts-expect-error incompatible shadowed field errors.
				public foo(): void {}
			}
		});

		it("optional custom shadowing", () => {
			class Schema extends schemaFactory.object("x", {
				foo: schemaFactory.optional(schemaFactory.number),
			}) {
				// Since fields are own properties, we expect inherited properties (like this) to be shadowed by fields.
				// However in TypeScript they work like inherited properties, so the types don't make the runtime behavior.
				// eslint-disable-next-line @typescript-eslint/class-literal-property-style
				public override get foo(): 5 {
					return 5;
				}
			}
			function typeTest() {
				const n = hydrate(Schema, { foo: 1 });
				assert.equal(n.foo, 1);
				// @ts-expect-error TypeScript typing does not understand that fields are own properties and thus shadow the getter here.
				n.foo = undefined;
			}

			function typeTest2() {
				const n = hydrate(Schema, { foo: undefined });
				const x = n.foo;
				// TypeScript is typing the "foo" field based on the getter not the field, which does not match runtime behavior.
				type check_ = requireAssignableTo<typeof x, 5>;
			}

			assert.throws(
				() => new Schema({ foo: undefined }),
				(e: Error) => validateAssertionError(e, /this shadowing will not work/),
			);
		});

		it("constructor", () => {
			// constructor is a special case, since one is built in on the derived type.
			class Schema extends schemaFactory.object("x", {
				constructor: schemaFactory.number,
			}) {}

			const n = hydrate(Schema, { constructor: 5 });

			const x = n.constructor;
			type check_ = requireAssignableTo<typeof x, number>;
			assert.equal(x, 5);
		});
	});

	it("empty property pojo deep equals", () => {
		const Schema = schemaFactory.object("x", {
			foo: schemaFactory.optional(schemaFactory.number),
		});
		const n = hydrate(Schema, { foo: undefined });
		assert.deepEqual(n, {});
	});

	it("empty property enumerability", () => {
		class Schema extends schemaFactory.object("x", {
			foo: schemaFactory.optional(schemaFactory.number),
		}) {}
		const n = hydrate(Schema, { foo: undefined });
		assert.deepEqual({ ...n }, {});
		const descriptor = Reflect.getOwnPropertyDescriptor(n, "foo") ?? assert.fail();
		assert.equal(descriptor.enumerable, false);
		assert.equal(descriptor.value, undefined);
		const keys = Object.keys(n);
		assert.deepEqual(keys, []);
	});

	it("full property enumerability", () => {
		class Schema extends schemaFactory.object("x", {
			foo: schemaFactory.optional(schemaFactory.number),
		}) {}
		const n = hydrate(Schema, { foo: 0 });
		assert.deepEqual({ ...n }, { foo: 0 });
		const descriptor = Reflect.getOwnPropertyDescriptor(n, "foo") ?? assert.fail();
		assert.equal(descriptor.enumerable, true);
		assert.equal(descriptor.value, 0);
		const keys = Object.keys(n);
		assert.deepEqual(keys, ["foo"]);
	});

	// it.only("leaf access test", () => {
	// 	class InnerSchema extends schemaFactory.object("inner", {
	// 		foo: schemaFactory.optional(schemaFactory.number),
	// 	}) {}
	// 	class Schema extends schemaFactory.object("x", {
	// 		optionalNumber: schemaFactory.optional(schemaFactory.number),
	// 		requiredNumber: schemaFactory.required(schemaFactory.number),
	// 		numberSequence: schemaFactory.array(schemaFactory.number),
	// 		objectSequence: schemaFactory.array(InnerSchema),
	// 	}) {}
	// 	const n = hydrate(Schema, {
	// 		optionalNumber: 0,
	// 		requiredNumber: 1,
	// 		numberSequence: [2, 3],
	// 		objectSequence: [{ foo: 4 }],
	// 	});

	// 	const accessedValue = n.optionalNumber;
	// 	assert.deepEqual(accessedValue, 0);
	// 	const accessedValue2 = n.requiredNumber;
	// 	assert.deepEqual(accessedValue2, 1);
	// 	const accessedValue3 = n.numberSequence[0];
	// 	assert.deepEqual(accessedValue3, 2);
	// 	const accessedValue5 = n.objectSequence[0].foo;
	// 	assert.deepEqual(accessedValue5, 4);
	// 	const accessedValue4 = n.objectSequence[0];
	// 	assert.deepEqual(accessedValue4, [{ foo: 4 }]);
	// });
});
