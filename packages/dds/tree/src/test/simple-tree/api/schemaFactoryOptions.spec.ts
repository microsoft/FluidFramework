/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactoryAlpha,
	composeSchemaFactoryAlphaOptions,
	type SchemaFactoryAlphaOptions,
} from "../../../simple-tree/index.js";

describe("schemaFactoryOptions", () => {
	describe("composeSchemaFactoryAlphaOptions", () => {
		it("chains callbacks: both effects are applied", () => {
			const base: SchemaFactoryAlphaOptions = {
				objectOptionDefaults: (_name, _fields, options) => ({
					allowUnknownOptionalFields: true,
					...options,
				}),
			};
			const override: SchemaFactoryAlphaOptions = {
				objectOptionDefaults: (_name, _fields, options) => ({
					metadata: { description: "from override" },
					...options,
				}),
			};
			const composed = composeSchemaFactoryAlphaOptions(base, override);
			const sf = new SchemaFactoryAlpha({ scope: "test", ...composed });

			const Schema = sf.objectAlpha("Foo", { x: sf.number });
			assert.equal(Schema.allowUnknownOptionalFields, true, "base effect preserved");
			assert.equal(Schema.metadata.description, "from override", "override effect applied");
		});

		it("override wins on conflicts", () => {
			const base: SchemaFactoryAlphaOptions = {
				objectOptionDefaults: (_name, _fields, options) => ({
					allowUnknownOptionalFields: true,
					...options,
				}),
			};
			// override sets allowUnknownOptionalFields to false, spread last so it wins
			const override: SchemaFactoryAlphaOptions = {
				objectOptionDefaults: (_name, _fields, options) => ({
					...options,
					allowUnknownOptionalFields: false,
				}),
			};
			const composed = composeSchemaFactoryAlphaOptions(base, override);
			const sf = new SchemaFactoryAlpha({ scope: "test", ...composed });

			const Schema = sf.objectAlpha("Foo", { x: sf.number });
			assert.equal(Schema.allowUnknownOptionalFields, false, "override wins");
		});
	});
});
