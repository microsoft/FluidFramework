/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	areSafelyAssignable,
	isAny,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "../../util";
import { AllowedTypes, FieldKinds, TreeSchema } from "../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { SchemaBuilder } from "../../feature-libraries/schemaBuilder";

describe("typedTreeSchema", () => {
	it("recursive", () => {
		const builder = new SchemaBuilder("test");

		const recursiveStruct = builder.structRecursive("recursiveStruct", {
			foo: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => recursiveStruct),
		});

		type _1 = requireTrue<
			areSafelyAssignable<
				typeof recursiveStruct,
				ReturnType<typeof recursiveStruct.structFieldsObject.foo.allowedTypes[0]>
			>
		>;
	});

	it("recursive without special functions", () => {
		// Recursive helper function are needed but can be avoided due to issues covered in https://github.com/microsoft/TypeScript/issues/55758.
		// This workaround seems to only work for compile time, not for intellisense, which makes it not very useful in practice and hard to verify that it works.
		const builder = new SchemaBuilder("test");

		const recursiveReference = () => recursiveStruct;
		type _trickCompilerIntoWorking = requireAssignableTo<
			typeof recursiveReference,
			() => TreeSchema
		>;
		const recursiveStruct = builder.struct("recursiveStruct2", {
			foo: SchemaBuilder.field(FieldKinds.optional, recursiveReference),
		});

		type _0 = requireFalse<isAny<typeof recursiveStruct>>;
		type _1 = requireTrue<
			areSafelyAssignable<
				typeof recursiveStruct,
				ReturnType<typeof recursiveStruct.structFieldsObject.foo.allowedTypes[0]>
			>
		>;
	});

	// Slightly different variant of the above test
	it("recursive without special functions2", () => {
		// This function helps the TypeScript compiler imagine a world where it solves for types in a different order, and thus handles the cases we need.
		// Some related information in https://github.com/microsoft/TypeScript/issues/55758.
		function fixRecursiveReference<T extends AllowedTypes>(...types: T): void {}

		const builder = new SchemaBuilder("test");

		const recursiveReference = () => recursiveStruct;
		fixRecursiveReference(recursiveReference);
		const recursiveStruct = builder.struct("recursiveStruct2", {
			foo: SchemaBuilder.field(FieldKinds.optional, recursiveReference),
		});

		type _0 = requireFalse<isAny<typeof recursiveStruct>>;
		type _1 = requireTrue<
			areSafelyAssignable<
				typeof recursiveStruct,
				ReturnType<typeof recursiveStruct.structFieldsObject.foo.allowedTypes[0]>
			>
		>;
	});
});
