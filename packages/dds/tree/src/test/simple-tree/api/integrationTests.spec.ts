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
			validateUsageError(/recursive/),
		);
	});

	it("making a recursive unhydrated and and parented object node errors", () => {
		const obj = new O({ recursive: undefined });
		const objOuter = new O({ recursive: obj });
		assert.throws(
			() => {
				obj.recursive = obj;
			},
			validateUsageError(/more than one place/),
		);
	});
});
