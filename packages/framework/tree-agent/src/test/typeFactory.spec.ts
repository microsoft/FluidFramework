/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree/internal";

import { isTypeFactoryType, typeFactory as tf } from "../treeAgentTypes.js";

const sf = new SchemaFactory("test");

describe("type factories", () => {
	describe("primitive types", () => {
		it("creates string type", () => {
			const stringType = tf.string();
			assert(isTypeFactoryType(stringType));
			assert.equal(stringType._kind, "string");
		});

		it("creates number type", () => {
			const numberType = tf.number();
			assert(isTypeFactoryType(numberType));
			assert.equal(numberType._kind, "number");
		});

		it("creates boolean type", () => {
			const booleanType = tf.boolean();
			assert(isTypeFactoryType(booleanType));
			assert.equal(booleanType._kind, "boolean");
		});

		it("creates void type", () => {
			const voidType = tf.void();
			assert(isTypeFactoryType(voidType));
			assert.equal(voidType._kind, "void");
		});

		it("creates undefined type", () => {
			const undefinedType = tf.undefined();
			assert(isTypeFactoryType(undefinedType));
			assert.equal(undefinedType._kind, "undefined");
		});

		it("creates null type", () => {
			const nullType = tf.null();
			assert(isTypeFactoryType(nullType));
			assert.equal(nullType._kind, "null");
		});

		it("creates unknown type", () => {
			const unknownType = tf.unknown();
			assert(isTypeFactoryType(unknownType));
			assert.equal(unknownType._kind, "unknown");
		});
	});

	describe("complex types", () => {
		it("creates array type", () => {
			const arrayType = tf.array(tf.string());
			assert(isTypeFactoryType(arrayType));
			assert.equal(arrayType._kind, "array");
			assert(isTypeFactoryType(arrayType.element));
			assert.equal(arrayType.element._kind, "string");
		});

		it("creates object type", () => {
			const objectType = tf.object({ name: tf.string(), age: tf.number() });
			assert(isTypeFactoryType(objectType));
			assert.equal(objectType._kind, "object");
			const shape = objectType.shape;
			assert(shape !== undefined);
			assert(isTypeFactoryType(shape.name));
			assert.equal(shape.name._kind, "string");
			assert(isTypeFactoryType(shape.age));
			assert.equal(shape.age._kind, "number");
		});

		it("creates record type", () => {
			const recordType = tf.record(tf.string(), tf.number());
			assert(isTypeFactoryType(recordType));
			assert.equal(recordType._kind, "record");
			assert(isTypeFactoryType(recordType.keyType));
			assert(isTypeFactoryType(recordType.valueType));
		});

		it("creates map type", () => {
			const mapType = tf.map(tf.string(), tf.number());
			assert(isTypeFactoryType(mapType));
			assert.equal(mapType._kind, "map");
			assert(isTypeFactoryType(mapType.keyType));
			assert(isTypeFactoryType(mapType.valueType));
		});

		it("creates tuple type", () => {
			const tupleType = tf.tuple([tf.string(), tf.number()]);
			assert(isTypeFactoryType(tupleType));
			assert.equal(tupleType._kind, "tuple");
			const items = tupleType.items;
			assert(Array.isArray(items));
			assert.equal(items.length, 2);
			assert(isTypeFactoryType(items[0]));
			assert(isTypeFactoryType(items[1]));
		});

		it("creates tuple type with rest", () => {
			const tupleType = tf.tuple([tf.string()], tf.number());
			assert(isTypeFactoryType(tupleType));
			assert.equal(tupleType._kind, "tuple");
			const rest = tupleType.rest;
			assert(isTypeFactoryType(rest));
			assert.equal(rest._kind, "number");
		});

		it("creates union type", () => {
			const unionType = tf.union([tf.string(), tf.number()]);
			assert(isTypeFactoryType(unionType));
			assert.equal(unionType._kind, "union");
			const options = unionType.options;
			assert(Array.isArray(options));
			assert.equal(options.length, 2);
		});

		it("creates literal type", () => {
			const literalType = tf.literal("hello");
			assert(isTypeFactoryType(literalType));
			assert.equal(literalType._kind, "literal");
			assert.equal(literalType.value, "hello");
		});

		it("creates optional type", () => {
			const optionalType = tf.optional(tf.string());
			assert(isTypeFactoryType(optionalType));
			assert.equal(optionalType._kind, "optional");
			const innerType = optionalType.innerType;
			assert(isTypeFactoryType(innerType));
			assert.equal(innerType._kind, "string");
		});

		it("creates readonly type", () => {
			const readonlyType = tf.readonly(tf.array(tf.string()));
			assert(isTypeFactoryType(readonlyType));
			assert.equal(readonlyType._kind, "readonly");
			const innerType = readonlyType.innerType;
			assert(isTypeFactoryType(innerType));
			assert.equal(innerType._kind, "array");
		});

		it("creates instanceOf type with ObjectNodeSchema", () => {
			class MyClass extends sf.object("MyClass", {}) {}
			const instanceOfType = tf.instanceOf(MyClass);
			assert(isTypeFactoryType(instanceOfType));
			assert.equal(instanceOfType._kind, "instanceof");
			assert.equal(instanceOfType.schema, MyClass);
		});

		it("throws error for instanceOf with non-ObjectNodeSchema", () => {
			class ArraySchema extends sf.array("ArraySchema", sf.string) {}
			assert.throws(
				() => tf.instanceOf(ArraySchema),
				/typeFactory\.instanceOf only supports ObjectNodeSchema-based schema classes/,
			);
		});

		it("throws error for empty union", () => {
			assert.throws(() => tf.union([]), /typeFactory\.union requires at least one option/);
		});

		it("throws error for empty tuple without rest", () => {
			assert.throws(
				() => tf.tuple([]),
				/typeFactory\.tuple requires at least one item or a rest type/,
			);
		});

		it("allows tuple with only rest type", () => {
			const tupleType = tf.tuple([], tf.string());
			assert(isTypeFactoryType(tupleType));
			assert.equal(tupleType._kind, "tuple");
			assert.equal(tupleType.items.length, 0);
			assert(isTypeFactoryType(tupleType.rest));
		});
	});

	describe("isTypeFactoryType type guard", () => {
		it("returns true for Type Factory types", () => {
			assert(isTypeFactoryType(tf.string()));
			assert(isTypeFactoryType(tf.number()));
			assert(isTypeFactoryType(tf.object({})));
		});

		it("returns false for non-Type Factory types", () => {
			// eslint-disable-next-line unicorn/no-null
			assert(!isTypeFactoryType(null));
			assert(!isTypeFactoryType(undefined));
			assert(!isTypeFactoryType("string"));
			assert(!isTypeFactoryType(42));
			assert(!isTypeFactoryType({}));
			assert(!isTypeFactoryType({ _kind: "fake" }));
		});
	});
});
