/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	schemaStatics,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/schemaStatics.js";
import { allowUnused, SchemaFactoryAlpha } from "../../../simple-tree/index.js";
import type {
	areSafelyAssignable,
	requireAssignableTo,
	requireTrue,
} from "../../../util/index.js";

describe("schemaStatics", () => {
	it("optional", () => {
		const field = schemaStatics.optional(schemaStatics.number);

		const fieldRecursive = schemaStatics.optionalRecursive(schemaStatics.number);

		const fieldArray = schemaStatics.optional([() => schemaStatics.number]);

		const fieldRecursiveAnnotated = schemaStatics.optionalRecursive(
			SchemaFactoryAlpha.types([
				{
					type: () => schemaStatics.number,
					metadata: {},
				},
			]),
		);

		const arrayOfAnnotated = schemaStatics.optionalRecursive(
			SchemaFactoryAlpha.types([{ type: () => schemaStatics.number, metadata: {} }]),
		);

		allowUnused<requireTrue<areSafelyAssignable<typeof field, typeof fieldRecursive>>>();
		allowUnused<requireAssignableTo<typeof fieldRecursiveAnnotated, typeof fieldArray>>();

		assert.deepEqual(field.allowedTypeSet, arrayOfAnnotated.allowedTypeSet);
	});
});
