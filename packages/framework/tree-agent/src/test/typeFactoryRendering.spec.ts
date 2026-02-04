/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree/internal";

import { renderTypeFactoryTypeScript } from "../renderTypeFactoryTypeScript.js";
import { typeFactory as tf, type TypeFactoryType } from "../treeAgentTypes.js";

const sf = new SchemaFactory("test");

describe("renderTypeFactoryTypeScript", () => {
	describe("primitive types", () => {
		it("renders string type", () => {
			const result = renderTypeFactoryTypeScript(tf.string(), () => "");
			assert.equal(result, "string");
		});

		it("renders number type", () => {
			const result = renderTypeFactoryTypeScript(tf.number(), () => "");
			assert.equal(result, "number");
		});

		it("renders boolean type", () => {
			const result = renderTypeFactoryTypeScript(tf.boolean(), () => "");
			assert.equal(result, "boolean");
		});

		it("renders void type", () => {
			const result = renderTypeFactoryTypeScript(tf.void(), () => "");
			assert.equal(result, "void");
		});

		it("renders undefined type", () => {
			const result = renderTypeFactoryTypeScript(tf.undefined(), () => "");
			assert.equal(result, "undefined");
		});

		it("renders null type", () => {
			const result = renderTypeFactoryTypeScript(tf.null(), () => "");
			assert.equal(result, "null");
		});

		it("renders unknown type", () => {
			const result = renderTypeFactoryTypeScript(tf.unknown(), () => "");
			assert.equal(result, "unknown");
		});
	});

	describe("array types", () => {
		it("renders simple array", () => {
			const result = renderTypeFactoryTypeScript(tf.array(tf.string()), () => "");
			assert.equal(result, "string[]");
		});

		it("renders nested array", () => {
			const result = renderTypeFactoryTypeScript(tf.array(tf.array(tf.number())), () => "");
			assert.equal(result, "number[][]");
		});
	});

	describe("object types", () => {
		it("renders simple object", () => {
			const objectType = tf.object({
				name: tf.string(),
				age: tf.number(),
			});
			const result = renderTypeFactoryTypeScript(objectType, () => "");
			assert.equal(
				result,
				`{
    name: string;
    age: number;
}`,
			);
		});

		it("renders empty object", () => {
			const result = renderTypeFactoryTypeScript(tf.object({}), () => "");
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
			const result = renderTypeFactoryTypeScript(objectType, () => "");
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
			const result = renderTypeFactoryTypeScript(unionType, () => "");
			assert.equal(result, "string | number");
		});

		it("renders union with optional as union with undefined", () => {
			const optionalType = tf.optional(tf.string());
			const result = renderTypeFactoryTypeScript(optionalType, () => "");
			assert.equal(result, "string | undefined");
		});
	});

	describe("record types", () => {
		it("renders record type", () => {
			const recordType = tf.record(tf.string(), tf.number());
			const result = renderTypeFactoryTypeScript(recordType, () => "");
			assert.equal(result, "Record<string, number>");
		});
	});

	describe("map types", () => {
		it("renders map type", () => {
			const mapType = tf.map(tf.string(), tf.number());
			const result = renderTypeFactoryTypeScript(mapType, () => "");
			assert.equal(result, "Map<string, number>");
		});
	});

	describe("tuple types", () => {
		it("renders simple tuple", () => {
			const tupleType = tf.tuple([tf.string(), tf.number()]);
			const result = renderTypeFactoryTypeScript(tupleType, () => "");
			assert.equal(result, "[string, number]");
		});

		it("renders tuple with rest", () => {
			const tupleType = tf.tuple([tf.string()], tf.number());
			const result = renderTypeFactoryTypeScript(tupleType, () => "");
			assert.equal(result, "[string, ...number[]]");
		});

		it("renders tuple with optional element", () => {
			const tupleType = tf.tuple([tf.string(), tf.optional(tf.number())]);
			const result = renderTypeFactoryTypeScript(tupleType, () => "");
			assert.equal(result, "[string, number?]");
		});
	});

	describe("literal types", () => {
		it("renders string literal", () => {
			const literalType = tf.literal("hello");
			const result = renderTypeFactoryTypeScript(literalType, () => "");
			assert.equal(result, '"hello"');
		});

		it("renders number literal", () => {
			const literalType = tf.literal(42);
			const result = renderTypeFactoryTypeScript(literalType, () => "");
			assert.equal(result, "42");
		});

		it("renders boolean literal", () => {
			const literalType = tf.literal(true);
			const result = renderTypeFactoryTypeScript(literalType, () => "");
			assert.equal(result, "true");
		});
	});

	describe("date type", () => {
		it("renders date type", () => {
			const result = renderTypeFactoryTypeScript(tf.date(), () => "");
			assert.equal(result, "Date");
		});
	});

	describe("promise types", () => {
		it("renders simple promise", () => {
			const promiseType = tf.promise(tf.string());
			const result = renderTypeFactoryTypeScript(promiseType, () => "");
			assert.equal(result, "Promise<string>");
		});

		it("renders nested promise", () => {
			const promiseType = tf.promise(tf.promise(tf.number()));
			const result = renderTypeFactoryTypeScript(promiseType, () => "");
			assert.equal(result, "Promise<Promise<number>>");
		});

		it("renders promise with complex inner type", () => {
			const promiseType = tf.promise(
				tf.object({
					id: tf.number(),
					name: tf.string(),
				}),
			);
			const result = renderTypeFactoryTypeScript(promiseType, () => "");
			assert.equal(
				result,
				`Promise<{
    id: number;
    name: string;
}>`,
			);
		});

		it("renders promise with union inner type", () => {
			const promiseType = tf.promise(tf.union([tf.string(), tf.number()]));
			const result = renderTypeFactoryTypeScript(promiseType, () => "");
			assert.equal(result, "Promise<string | number>");
		});
	});

	describe("intersection types", () => {
		it("renders simple intersection", () => {
			const intersectionType = tf.intersection([
				tf.object({ name: tf.string() }),
				tf.object({ age: tf.number() }),
			]);
			const result = renderTypeFactoryTypeScript(intersectionType, () => "");
			assert.equal(
				result,
				`{
    name: string;
} & {
    age: number;
}`,
			);
		});

		it("renders intersection with multiple types", () => {
			const intersectionType = tf.intersection([
				tf.object({ a: tf.string() }),
				tf.object({ b: tf.number() }),
				tf.object({ c: tf.boolean() }),
			]);
			const result = renderTypeFactoryTypeScript(intersectionType, () => "");
			assert.equal(
				result,
				`{
    a: string;
} & {
    b: number;
} & {
    c: boolean;
}`,
			);
		});

		it("renders intersection with union (checks precedence)", () => {
			const intersectionType = tf.intersection([
				tf.union([tf.string(), tf.number()]),
				tf.object({ optional: tf.optional(tf.boolean()) }),
			]);
			const result = renderTypeFactoryTypeScript(intersectionType, () => "");
			assert.equal(
				result,
				`(string | number) & {
    optional?: boolean;
}`,
			);
		});

		it("renders union with intersection (checks precedence)", () => {
			const unionType = tf.union([
				tf.intersection([tf.object({ a: tf.string() }), tf.object({ b: tf.number() })]),
				tf.string(),
			]);
			const result = renderTypeFactoryTypeScript(unionType, () => "");
			// Note: Parentheses not required since & binds tighter than |
			assert.equal(
				result,
				`{
    a: string;
} & {
    b: number;
} | string`,
			);
		});
	});

	describe("function types", () => {
		it("renders simple function", () => {
			const functionType = tf.function([["arg", tf.string()]], tf.number());
			const result = renderTypeFactoryTypeScript(functionType, () => "");
			assert.equal(result, "(arg: string) => number");
		});

		it("renders function with multiple arguments", () => {
			const functionType = tf.function(
				[
					["x", tf.number()],
					["y", tf.number()],
				],
				tf.number(),
			);
			const result = renderTypeFactoryTypeScript(functionType, () => "");
			assert.equal(result, "(x: number, y: number) => number");
		});

		it("renders function with optional parameter", () => {
			const functionType = tf.function(
				[
					["required", tf.string()],
					["optional", tf.optional(tf.number())],
				],
				tf.void(),
			);
			const result = renderTypeFactoryTypeScript(functionType, () => "");
			assert.equal(result, "(required: string, optional?: number) => void");
		});

		it("renders function with rest parameter", () => {
			const functionType = tf.function([["first", tf.string()]], tf.void(), [
				"rest",
				tf.number(),
			]);
			const result = renderTypeFactoryTypeScript(functionType, () => "");
			assert.equal(result, "(first: string, ...rest: number[]) => void");
		});

		it("renders function with no parameters", () => {
			const functionType = tf.function([], tf.string());
			const result = renderTypeFactoryTypeScript(functionType, () => "");
			assert.equal(result, "() => string");
		});

		it("renders function returning complex type", () => {
			const functionType = tf.function(
				[["id", tf.number()]],
				tf.promise(tf.object({ name: tf.string() })),
			);
			const result = renderTypeFactoryTypeScript(functionType, () => "");
			assert.equal(
				result,
				`(id: number) => Promise<{
    name: string;
}>`,
			);
		});
	});

	describe("readonly types", () => {
		it("renders readonly type", () => {
			const readonlyType = tf.readonly(tf.string());
			const result = renderTypeFactoryTypeScript(readonlyType, () => "");
			assert.equal(result, "Readonly<string>");
		});
	});

	describe("instanceOf", () => {
		it("renders instanceOf type using getFriendlyName", () => {
			class MyClass extends sf.object("MyClass", {}) {}
			const instanceOfType = tf.instanceOf(MyClass);
			const result = renderTypeFactoryTypeScript(instanceOfType, (schema) => {
				if (schema === MyClass) return "MyClass";
				return "Unknown";
			});
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
			const result = renderTypeFactoryTypeScript(complexType, () => "");
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
		it("throws UsageError for unsupported type kind", () => {
			const invalidType = { _kind: "__invalid__" } as unknown as TypeFactoryType;
			assert.throws(
				() => renderTypeFactoryTypeScript(invalidType, () => ""),
				/Unsupported type when formatting helper types: invalid/,
			);
		});

		it("error message lists expected type kinds", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
			const invalidType = { _kind: "invalid" } as any;
			try {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				renderTypeFactoryTypeScript(invalidType, () => "");
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
