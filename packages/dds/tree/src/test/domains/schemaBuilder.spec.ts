/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilder, leaf } from "../../domains/index.js";
import { FieldKinds, FlexFieldSchema } from "../../feature-libraries/index.js";
import type { isAny, requireFalse } from "../../util/index.js";

describe("domains - SchemaBuilder", () => {
	it("object", () => {
		const builder = new SchemaBuilder({ scope: "Test Domain" });

		const testObject = builder.object("object", {
			number: leaf.number,
		});

		type _0 = requireFalse<isAny<typeof testObject>>;
	});

	it("objectRecursive", () => {
		const builder = new SchemaBuilder({ scope: "Test Recursive Domain" });

		const recursiveObject = builder.objectRecursive("object", {
			recursive: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveObject]),
			number: SchemaBuilder.required(leaf.number),
		});

		type _0 = requireFalse<isAny<typeof recursiveObject>>;
	});
});
