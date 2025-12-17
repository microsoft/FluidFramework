/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	createFromCursor,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/create.js";

import {
	restrictiveStoredSchemaGenerationOptions,
	SchemaFactory,
	toStoredSchema,
} from "../../../simple-tree/index.js";
import { singleJsonCursor } from "../../json/index.js";

describe("simple-tree create", () => {
	describe("createFromCursor", () => {
		it("Success", () => {
			const cursor = singleJsonCursor("Hello world");
			createFromCursor(
				SchemaFactory.string,
				cursor,
				toStoredSchema(SchemaFactory.string, restrictiveStoredSchemaGenerationOptions)
					.rootFieldSchema,
			);
		});

		it("Failure: unknown schema", () => {
			const cursor = singleJsonCursor("Hello world");
			assert.throws(
				() =>
					createFromCursor(
						SchemaFactory.number,
						cursor,
						toStoredSchema(SchemaFactory.number, restrictiveStoredSchemaGenerationOptions)
							.rootFieldSchema,
					),
				validateUsageError(
					`Failed to parse tree due to occurrence of type "com.fluidframework.leaf.string" which is not defined in this context.`,
				),
			);
		});

		it("Failure: out of schema", () => {
			const factory = new SchemaFactory("test");
			class Obj extends factory.object("Obj", { x: SchemaFactory.string }) {}
			const cursor = singleJsonCursor("Hello world");
			assert.throws(
				() =>
					createFromCursor(
						Obj,
						cursor,
						toStoredSchema(Obj, restrictiveStoredSchemaGenerationOptions).rootFieldSchema,
					),
				validateUsageError(/does not conform to schema/),
			);
		});
	});
});
