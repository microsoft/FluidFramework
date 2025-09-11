/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	optionalRecursive2,
	schemaStatics,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/schemaStatics.js";
import { allowUnused } from "../../../simple-tree/index.js";
import type { areSafelyAssignable, requireTrue } from "../../../util/index.js";

describe("schemaStatics", () => {
	it("optional", () => {
		const field = schemaStatics.optional(schemaStatics.number);

		const fieldRecursive = schemaStatics.optionalRecursive(schemaStatics.number);

		const fieldArray = schemaStatics.optional([() => schemaStatics.number]);

		const fieldRecursiveAnnotated = schemaStatics.optionalRecursive({
			type: () => schemaStatics.number,
			metadata: {},
		});

		{
			const arrayOfAnnotated = schemaStatics.optionalRecursive([
				{ type: () => schemaStatics.number, metadata: {} },
			]);

			const arrayOfAnnotated2 = optionalRecursive2([
				{ type: () => schemaStatics.number, metadata: {} },
			]);

			allowUnused<requireTrue<areSafelyAssignable<typeof field, typeof fieldRecursive>>>();
			allowUnused<
				requireTrue<areSafelyAssignable<typeof fieldArray, typeof fieldRecursiveAnnotated>>
			>();
			// Broken due to overload resolution issue.
			allowUnused<
				requireTrue<areSafelyAssignable<typeof arrayOfAnnotated, typeof fieldArray>>
			>();

			allowUnused<
				requireTrue<areSafelyAssignable<typeof arrayOfAnnotated2, typeof fieldArray>>
			>();

			assert.deepEqual(field.allowedTypeSet, arrayOfAnnotated.allowedTypeSet);
			assert.deepEqual(field.allowedTypeSet, arrayOfAnnotated2.allowedTypeSet);
		}

		{
			const arrayOfAnnotated = schemaStatics.optionalRecursive({
				types: [{ type: () => schemaStatics.number, metadata: {} }],
				metadata: {},
			});

			const arrayOfAnnotated2 = optionalRecursive2({
				types: [{ type: () => schemaStatics.number, metadata: {} }],
				metadata: {},
			});

			allowUnused<requireTrue<areSafelyAssignable<typeof field, typeof fieldRecursive>>>();
			allowUnused<
				requireTrue<areSafelyAssignable<typeof fieldArray, typeof fieldRecursiveAnnotated>>
			>();
			allowUnused<
				requireTrue<areSafelyAssignable<typeof arrayOfAnnotated, typeof fieldArray>>
			>();

			allowUnused<
				requireTrue<areSafelyAssignable<typeof arrayOfAnnotated2, typeof fieldArray>>
			>();

			assert.deepEqual(field.allowedTypeSet, arrayOfAnnotated.allowedTypeSet);
			assert.deepEqual(field.allowedTypeSet, arrayOfAnnotated2.allowedTypeSet);
		}
	});
});
