/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree/internal";

import {
	instanceOfsTypeFactory,
	renderTypeFactoryTypeScript,
} from "../renderTypeFactoryTypeScript.js";
import { typeFactory as tf } from "../treeAgentTypes.js";

const sf = new SchemaFactory("test");

describe("renderTypeFactoryTypeScript", () => {
	describe("primitive types", () => {
		it("renders string type", () => {
			const result = renderTypeFactoryTypeScript(
				tf.string(),
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "string");
		});

		it("renders number type", () => {
			const result = renderTypeFactoryTypeScript(
				tf.number(),
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "number");
		});

		it("renders boolean type", () => {
			const result = renderTypeFactoryTypeScript(
				tf.boolean(),
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "boolean");
		});

		it("renders void type", () => {
			const result = renderTypeFactoryTypeScript(tf.void(), () => "", instanceOfsTypeFactory);
			assert.equal(result, "void");
		});

		it("renders undefined type", () => {
			const result = renderTypeFactoryTypeScript(
				tf.undefined(),
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "undefined");
		});

		it("renders null type", () => {
			const result = renderTypeFactoryTypeScript(tf.null(), () => "", instanceOfsTypeFactory);
			assert.equal(result, "null");
		});

		it("renders unknown type", () => {
			const result = renderTypeFactoryTypeScript(
				tf.unknown(),
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "unknown");
		});
	});

	describe("array types", () => {
		it("renders simple array", () => {
			const result = renderTypeFactoryTypeScript(
				tf.array(tf.string()),
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "string[]");
		});

		it("renders nested array", () => {
			const result = renderTypeFactoryTypeScript(
				tf.array(tf.array(tf.number())),
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "number[][]");
		});
	});

	describe("object types", () => {
		it("renders simple object", () => {
			const objectType = tf.object({
				name: tf.string(),
				age: tf.number(),
			});
			const result = renderTypeFactoryTypeScript(objectType, () => "", instanceOfsTypeFactory);
			assert.equal(
				result,
				`{
    name: string;
    age: number;
}`,
			);
		});

		it("renders empty object", () => {
			const result = renderTypeFactoryTypeScript(
				tf.object({}),
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(
				result,
				`{
}`,
			);
		});

		it("renders object with optional property", () => {
			const objectType = tf.object({
				name: tf.string(),
				nickname: tf.optional(tf.string()),
			});
			const result = renderTypeFactoryTypeScript(objectType, () => "", instanceOfsTypeFactory);
			assert.equal(
				result,
				`{
    name: string;
    nickname?: string;
}`,
			);
		});
	});

	describe("union types", () => {
		it("renders simple union", () => {
			const unionType = tf.union([tf.string(), tf.number()]);
			const result = renderTypeFactoryTypeScript(unionType, () => "", instanceOfsTypeFactory);
			assert.equal(result, "string | number");
		});

		it("renders union with optional as union with undefined", () => {
			const optionalType = tf.optional(tf.string());
			const result = renderTypeFactoryTypeScript(
				optionalType,
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "string | undefined");
		});
	});

	describe("record types", () => {
		it("renders record type", () => {
			const recordType = tf.record(tf.string(), tf.number());
			const result = renderTypeFactoryTypeScript(recordType, () => "", instanceOfsTypeFactory);
			assert.equal(result, "Record<string, number>");
		});
	});

	describe("map types", () => {
		it("renders map type", () => {
			const mapType = tf.map(tf.string(), tf.number());
			const result = renderTypeFactoryTypeScript(mapType, () => "", instanceOfsTypeFactory);
			assert.equal(result, "Map<string, number>");
		});
	});

	describe("tuple types", () => {
		it("renders simple tuple", () => {
			const tupleType = tf.tuple([tf.string(), tf.number()]);
			const result = renderTypeFactoryTypeScript(tupleType, () => "", instanceOfsTypeFactory);
			assert.equal(result, "[string, number]");
		});

		it("renders tuple with rest", () => {
			const tupleType = tf.tuple([tf.string()], tf.number());
			const result = renderTypeFactoryTypeScript(tupleType, () => "", instanceOfsTypeFactory);
			assert.equal(result, "[string, ...number[]]");
		});

		it("renders tuple with optional element", () => {
			const tupleType = tf.tuple([tf.string(), tf.optional(tf.number())]);
			const result = renderTypeFactoryTypeScript(tupleType, () => "", instanceOfsTypeFactory);
			assert.equal(result, "[string, number?]");
		});
	});

	describe("literal types", () => {
		it("renders string literal", () => {
			const literalType = tf.literal("hello");
			const result = renderTypeFactoryTypeScript(
				literalType,
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, '"hello"');
		});

		it("renders number literal", () => {
			const literalType = tf.literal(42);
			const result = renderTypeFactoryTypeScript(
				literalType,
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "42");
		});

		it("renders boolean literal", () => {
			const literalType = tf.literal(true);
			const result = renderTypeFactoryTypeScript(
				literalType,
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "true");
		});
	});

	describe("readonly types", () => {
		it("renders readonly type", () => {
			const readonlyType = tf.readonly(tf.string());
			const result = renderTypeFactoryTypeScript(
				readonlyType,
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(result, "Readonly<string>");
		});
	});

	describe("instanceOf", () => {
		it("renders instanceOf type using getFriendlyName", () => {
			class MyClass extends sf.object("MyClass", {}) {}
			const instanceOfType = tf.instanceOf(MyClass);
			const result = renderTypeFactoryTypeScript(
				instanceOfType,
				(schema) => {
					if (schema === MyClass) return "MyClass";
					return "Unknown";
				},
				instanceOfsTypeFactory,
			);
			assert.equal(result, "MyClass");
		});
	});

	describe("complex nested types", () => {
		it("renders complex nested structure", () => {
			const complexType = tf.object({
				items: tf.array(
					tf.object({
						id: tf.number(),
						tags: tf.optional(tf.array(tf.string())),
					}),
				),
				metadata: tf.record(tf.string(), tf.union([tf.string(), tf.number()])),
			});
			const result = renderTypeFactoryTypeScript(
				complexType,
				() => "",
				instanceOfsTypeFactory,
			);
			assert.equal(
				result,
				`{
    items: {
        id: number;
        tags?: string[];
    }[];
    metadata: Record<string, string | number>;
}`,
			);
		});
	});

	describe("error paths", () => {
		it("throws UsageError for missing instanceof lookup", () => {
			class MyClass extends sf.object("MyClass", {}) {}
			const instanceOfType = tf.instanceOf(MyClass);
			// Create an empty lookup that doesn't have the type
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-arguments
			const emptyLookup = new WeakMap<any, any>();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			assert.throws(
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				() => renderTypeFactoryTypeScript(instanceOfType, () => "", emptyLookup),
				/instanceof type not found in lookup/,
			);
		});

		it("throws UsageError for unsupported type kind", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
			const invalidType = { _kind: "invalid" } as any;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			assert.throws(
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				() => renderTypeFactoryTypeScript(invalidType, () => "", instanceOfsTypeFactory),
				/Unsupported type when formatting helper types: invalid/,
			);
		});

		it("error message lists expected type kinds", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
			const invalidType = { _kind: "invalid" } as any;
			try {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				renderTypeFactoryTypeScript(invalidType, () => "", instanceOfsTypeFactory);
				assert.fail("Expected error to be thrown");
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			} catch (error: any) {
				// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				assert(error.message.includes("Expected one of:"));
				// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				assert(error.message.includes("string"));
				// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				assert(error.message.includes("instanceof"));
			}
		});
	});
});
