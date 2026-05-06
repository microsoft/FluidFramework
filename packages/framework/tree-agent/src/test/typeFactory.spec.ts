/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree/internal";
import { isTypeFactoryType } from "@fluidframework/type-factory/alpha";

import { typeFactory as tf } from "../treeAgentTypes.js";

const sf = new SchemaFactory("test");

describe("type factories", () => {
	describe("complex types", () => {
		it("creates instanceOf type with ObjectNodeSchema", () => {
			class MyClass extends sf.object("MyClass", {}) {}
			const instanceOfType = tf.instanceOf(MyClass);
			assert(isTypeFactoryType(instanceOfType));
			assert.equal(instanceOfType._kind, "instanceof");
			assert.equal(instanceOfType.constructor, MyClass);
		});

		it("throws error for instanceOf with non-ObjectNodeSchema", () => {
			class ArraySchema extends sf.array("ArraySchema", sf.string) {}
			assert.throws(
				() => tf.instanceOf(ArraySchema),
				/typeFactory\.instanceOf only supports ObjectNodeSchema-based schema classes/,
			);
		});
	});
});
