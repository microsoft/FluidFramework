/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "../../../simple-tree/index.js";
import type {
	ValidateRecursiveSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/schemaFactoryRecursive.js";
import { validateUsageError } from "../../utils.js";

const sf = new SchemaFactory("integration");

describe("simple-tree API integration tests", () => {
	describe("recursive unhydrated nodes", () => {
		class O extends sf.objectRecursive("O", {
			recursive: sf.optionalRecursive([() => O]),
		}) {}
		{
			type _check = ValidateRecursiveSchema<typeof O>;
		}
		it("making a recursive unhydrated and un-parented object node errors", () => {
			const obj = new O({ recursive: undefined });
			assert.throws(
				() => {
					obj.recursive = obj;
				},
				validateUsageError(/under itself/),
			);
		});
	});

	describe("multi parenting unhydrated nodes", () => {
		class O extends sf.object("O", {
			prop: sf.optional(sf.string),
		}) {}

		class A extends sf.array("A", O) {}

		it("multi parenting an unhydrated node on edit errors", () => {
			const obj = new O({ prop: "o" });
			const array = new A([obj]);
			assert.throws(
				() => {
					array.insertAtEnd(obj);
				},
				validateUsageError(/more than one place/),
			);
		});

		it("multi parenting an unhydrated node on create errors", () => {
			const obj = new O({ prop: "o" });
			assert.throws(
				() => {
					new A([obj, obj]);
				},
				validateUsageError(/more than one place/),
			);
		});
	});
});
