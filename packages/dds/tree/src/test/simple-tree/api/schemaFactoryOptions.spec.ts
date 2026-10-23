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

		it("has no callback when neither input has one", () => {
			const composed = composeSchemaFactoryAlphaOptions({}, {});
			assert.equal(composed.objectOptionDefaults, undefined);
		});

		for (const position of ["base", "override"] as const) {
			it(`supports only a ${position} callback`, () => {
				const options: SchemaFactoryAlphaOptions = {
					objectOptionDefaults: (_name, _fields, perCallOptions) => ({
						allowUnknownOptionalFields: true,
						...perCallOptions,
					}),
				};
				const composed =
					position === "base"
						? composeSchemaFactoryAlphaOptions(options, {})
						: composeSchemaFactoryAlphaOptions({}, options);
				const sf = new SchemaFactoryAlpha({ ...composed, scope: "test" });
				assert.equal(sf.objectAlpha("Foo", {}).allowUnknownOptionalFields, true);
			});
		}

		it("preserves the input options when callbacks return undefined", () => {
			const calls: string[] = [];
			const perCallOptions = { allowUnknownOptionalFields: true };
			const fields = { x: SchemaFactoryAlpha.number };
			const composed = composeSchemaFactoryAlphaOptions(
				{
					objectOptionDefaults: (name, actualFields, options) => {
						calls.push("base");
						assert.equal(name, 42);
						assert.equal(actualFields, fields);
						assert.equal(options, perCallOptions);
						return undefined;
					},
				},
				{
					objectOptionDefaults: (name, actualFields, options) => {
						calls.push("override");
						assert.equal(name, 42);
						assert.equal(actualFields, fields);
						assert.equal(options, perCallOptions);
						return undefined;
					},
				},
			);
			const sf = new SchemaFactoryAlpha<"test", number>({ ...composed, scope: "test" });
			const Schema = sf.objectAlpha(42, fields, perCallOptions);
			assert.equal(Schema.identifier, "test.42");
			assert.equal(Schema.allowUnknownOptionalFields, true);
			assert.deepEqual(calls, ["base", "override"]);
		});

		it("keeps the base result when the override returns undefined", () => {
			const composed = composeSchemaFactoryAlphaOptions(
				{
					objectOptionDefaults: () => ({ allowUnknownOptionalFields: true }),
				},
				{ objectOptionDefaults: () => undefined },
			);
			const sf = new SchemaFactoryAlpha({ ...composed, scope: "test" });
			assert.equal(sf.objectAlpha("Foo", {}).allowUnknownOptionalFields, true);
		});
	});
});
