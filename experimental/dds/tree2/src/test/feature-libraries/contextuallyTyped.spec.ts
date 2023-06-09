/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { EmptyKey, MapTree, ValueSchema } from "../../core";

import {
	allowsValue,
	isPrimitiveValue,
	applyTypesFromContext,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../feature-libraries/contextuallyTyped";
import { SchemaBuilder } from "../../feature-libraries";

describe("ContextuallyTyped", () => {
	it("isPrimitiveValue", () => {
		assert(isPrimitiveValue(0));
		assert(isPrimitiveValue(0.001));
		assert(isPrimitiveValue(NaN));
		assert(isPrimitiveValue(true));
		assert(isPrimitiveValue(false));
		assert(isPrimitiveValue(""));
		assert(!isPrimitiveValue({}));
		assert(!isPrimitiveValue(undefined));
		assert(!isPrimitiveValue(null));
		assert(!isPrimitiveValue([]));
	});

	it("allowsValue", () => {
		assert(allowsValue(ValueSchema.Serializable, undefined));
		assert(!allowsValue(ValueSchema.Boolean, undefined));
		assert(allowsValue(ValueSchema.Nothing, undefined));
		assert(!allowsValue(ValueSchema.String, undefined));
		assert(!allowsValue(ValueSchema.Number, undefined));

		assert(allowsValue(ValueSchema.Serializable, false));
		assert(allowsValue(ValueSchema.Boolean, false));
		assert(!allowsValue(ValueSchema.Nothing, false));
		assert(!allowsValue(ValueSchema.String, false));
		assert(!allowsValue(ValueSchema.Number, false));

		assert(allowsValue(ValueSchema.Serializable, 5));
		assert(!allowsValue(ValueSchema.Boolean, 5));
		assert(!allowsValue(ValueSchema.Nothing, 5));
		assert(!allowsValue(ValueSchema.String, 5));
		assert(allowsValue(ValueSchema.Number, 5));

		assert(allowsValue(ValueSchema.Serializable, ""));
		assert(!allowsValue(ValueSchema.Boolean, ""));
		assert(!allowsValue(ValueSchema.Nothing, ""));
		assert(allowsValue(ValueSchema.String, ""));
		assert(!allowsValue(ValueSchema.Number, ""));

		assert(allowsValue(ValueSchema.Serializable, {}));
		assert(!allowsValue(ValueSchema.Boolean, {}));
		assert(!allowsValue(ValueSchema.Nothing, {}));
		assert(!allowsValue(ValueSchema.String, {}));
		assert(!allowsValue(ValueSchema.Number, {}));
	});

	it("applyTypesFromContext omits empty fields", () => {
		const builder = new SchemaBuilder("applyTypesFromContext");
		const numberSchema = builder.primitive("number", ValueSchema.Number);
		const numberSequence = SchemaBuilder.fieldSequence(numberSchema);
		const numbersObject = builder.object("numbers", { local: { numbers: numberSequence } });
		const schema = builder.intoDocumentSchema(numberSequence);
		const mapTree = applyTypesFromContext(schema, new Set([numbersObject.name]), {
			numbers: [],
		});
		const expected: MapTree = { fields: new Map(), type: numbersObject.name, value: undefined };
		assert.deepEqual(mapTree, expected);
	});

	it("applyTypesFromContext omits empty primary fields", () => {
		const builder = new SchemaBuilder("applyTypesFromContext");
		const numberSchema = builder.primitive("number", ValueSchema.Number);
		const numberSequence = SchemaBuilder.fieldSequence(numberSchema);
		const primaryObject = builder.object("numbers", { local: { [EmptyKey]: numberSequence } });
		const schema = builder.intoDocumentSchema(numberSequence);
		const mapTree = applyTypesFromContext(schema, new Set([primaryObject.name]), []);
		const expected: MapTree = { fields: new Map(), type: primaryObject.name, value: undefined };
		assert.deepEqual(mapTree, expected);
	});

	// TODO: more tests
});
