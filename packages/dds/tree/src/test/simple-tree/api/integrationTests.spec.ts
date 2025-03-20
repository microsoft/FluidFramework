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
	// TODO: AB#32207:
	// This case should produce a usage error (and thus allow this test to be un-skipped).
	// Currently this tests hangs forever, not even being terminated by the mocha timeout.
	// Depending on where the error is detected, tests for recursive maps, arrays and co-recursive cases may be needed.
	it.skip("making a recursive unhydrated object node errors", () => {
		class O extends sf.objectRecursive("O", {
			recursive: sf.optionalRecursive([() => O]),
		}) {}
		{
			type _check = ValidateRecursiveSchema<typeof O>;
		}
		const obj = new O({ recursive: undefined });
		assert.throws(
			() => {
				obj.recursive = obj;
			},
			validateUsageError(/recursive/),
		);
	});
});
