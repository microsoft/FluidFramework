/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createFromCursor,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/create.js";

import { SchemaFactory } from "../../../simple-tree/index.js";
import { validateUsageError } from "../../utils.js";
import { singleJsonCursor } from "../../json/index.js";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

describe("simple-tree create", () => {
	describe("createFromCursor", () => {
		it("Success", () => {
			const cursor = singleJsonCursor("Hello world");
			createFromCursor(SchemaFactory.string, cursor);
		});

		it("Failure: unknown schema", () => {
			const cursor = singleJsonCursor("Hello world");
			assert.throws(
				() => createFromCursor(SchemaFactory.number, cursor),
				(e: Error) => validateAssertionError(e, /Tree does not conform to schema/),
			);
		});

		it("Failure: out of schema", () => {
			const factory = new SchemaFactory("test");
			class Obj extends factory.object("Obj", { x: SchemaFactory.string }) {}
			const cursor = singleJsonCursor("Hello world");
			assert.throws(
				() => createFromCursor(Obj, cursor),
				validateUsageError(/does not conform to schema/),
			);
		});
	});
});
