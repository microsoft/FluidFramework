/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilder, leaf } from "../../domains/index.js";
import type { isAny, requireFalse } from "../../util/index.js";

describe("domains - SchemaBuilder", () => {
	it("object", () => {
		const builder = new SchemaBuilder({ scope: "Test Domain" });

		const testObject = builder.object("object", {
			number: leaf.number,
		});

		type _0 = requireFalse<isAny<typeof testObject>>;
	});
});
