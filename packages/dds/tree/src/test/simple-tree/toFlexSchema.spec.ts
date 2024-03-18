/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexSchema } from "../../simple-tree/toFlexSchema.js";
import { schemaIsObjectNode } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";

describe("toFlexSchema", () => {
	it("smoke test", () => {
		const schema = new SchemaFactory("com.example");
		class A extends schema.object("A", {}) {}
		toFlexSchema(A);
	});
	it("name collision", () => {
		const schema = new SchemaFactory("com.example");
		class A extends schema.object("A", {}) {}
		class B extends schema.object("A", {}) {}

		assert.throws(() => toFlexSchema([A, B]), /identifier "com.example.A"/);
	});
	it("builtins are the same", () => {
		const schema = new SchemaFactory("com.example");
		const schema2 = new SchemaFactory("com.example");
		assert.equal(schema.number, schema2.number);
	});
	it("stableName", () => {
		const schema = new SchemaFactory("test");
		const testSchema = schema.object("root", {
			optionalWithoutStableName: schema.optional(schema.number),
			optionalWithStableName: schema.optional(schema.number, {
				stableName: "stable-optional",
			}),
			requiredWithoutStableName: schema.required(schema.number),
			requiredWithStableName: schema.required(schema.number, {
				stableName: "stable-required",
			}),
		});

		// Get the schema of the node under the root
		const result = toFlexSchema(testSchema).nodeSchema.get(brand("test.root"));
		assert(result !== undefined);
		assert(schemaIsObjectNode(result));
		const fields = result.info;

		// For consistency
		/* eslint-disable @typescript-eslint/dot-notation */

		assert(fields["optionalWithoutStableName"] !== undefined);
		assert(fields["optionalWithStableName"] === undefined);
		assert(fields["stable-optional"] !== undefined);
		assert(fields["requiredWithoutStableName"] !== undefined);
		assert(fields["requiredWithStableName"] === undefined);
		assert(fields["stable-required"] !== undefined);

		/* eslint-enable @typescript-eslint/dot-notation */
	});
});
