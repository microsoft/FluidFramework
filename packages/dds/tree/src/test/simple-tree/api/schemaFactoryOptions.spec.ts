/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactoryAlpha,
	SchemaFactoryBeta,
	composeSchemaFactoryAlphaOptions,
	composeSchemaFactoryBetaOptions,
	getSimpleSchema,
	NodeKind,
	type SchemaFactoryBetaOptions,
	type TreeNodeSchema,
} from "../../../simple-tree/index.js";

function allowsUnknownOptionalFields(schema: TreeNodeSchema): boolean {
	const simple = getSimpleSchema(schema).definitions.get(schema.identifier);
	assert(simple?.kind === NodeKind.Object);
	return simple.allowUnknownOptionalFields;
}

describe("schemaFactoryOptions", () => {
	for (const [Factory, compose] of [
		[SchemaFactoryBeta, composeSchemaFactoryBetaOptions],
		[SchemaFactoryAlpha, composeSchemaFactoryAlphaOptions],
	] as const) {
		describe(compose.name, () => {
			it("chains callbacks: both effects are applied", () => {
				const base: SchemaFactoryBetaOptions = {
					objectOptions: (_name, _fields, options) => ({
						allowUnknownOptionalFields: true,
						...options,
					}),
				};
				const override: SchemaFactoryBetaOptions = {
					objectOptions: (_name, _fields, options) => ({
						metadata: { description: "from override" },
						...options,
					}),
				};
				const composed = compose(base, override);
				const sf = new Factory({ scope: "test", ...composed });

				const Schema = sf.object("Foo", { x: sf.number });
				assert.equal(allowsUnknownOptionalFields(Schema), true, "base effect preserved");
				assert.equal(Schema.metadata.description, "from override", "override effect applied");
			});

			it("override wins on conflicts", () => {
				const base: SchemaFactoryBetaOptions = {
					objectOptions: (_name, _fields, options) => ({
						allowUnknownOptionalFields: true,
						...options,
					}),
				};
				const override: SchemaFactoryBetaOptions = {
					objectOptions: (_name, _fields, options) => ({
						...options,
						allowUnknownOptionalFields: false,
					}),
				};
				const composed = compose(base, override);
				const sf = new Factory({ scope: "test", ...composed });

				const Schema = sf.object("Foo", { x: sf.number });
				assert.equal(allowsUnknownOptionalFields(Schema), false, "override wins");
			});

			it("has no callback when neither input has one", () => {
				const composed = compose({}, {});
				assert.equal(composed.objectOptions, undefined);
			});

			for (const position of ["base", "override"] as const) {
				it(`supports only a ${position} callback`, () => {
					const options: SchemaFactoryBetaOptions = {
						objectOptions: (_name, _fields, perCallOptions) => ({
							allowUnknownOptionalFields: true,
							...perCallOptions,
						}),
					};
					const composed = position === "base" ? compose(options, {}) : compose({}, options);
					const sf = new Factory({ ...composed, scope: "test" });
					assert.equal(allowsUnknownOptionalFields(sf.object("Foo", {})), true);
				});
			}

			it("preserves the input options when callbacks return undefined", () => {
				const calls: string[] = [];
				const perCallOptions = { allowUnknownOptionalFields: true };
				const fields = { x: Factory.number };
				const composed = compose(
					{
						objectOptions: (name, actualFields, options) => {
							calls.push("base");
							assert.equal(name, 42);
							assert.equal(actualFields, fields);
							assert.equal(options, perCallOptions);
							return undefined;
						},
					},
					{
						objectOptions: (name, actualFields, options) => {
							calls.push("override");
							assert.equal(name, 42);
							assert.equal(actualFields, fields);
							assert.equal(options, perCallOptions);
							return undefined;
						},
					},
				);
				const sf = new Factory<"test", number>({ ...composed, scope: "test" });
				const Schema = sf.object(42, fields, perCallOptions);
				assert.equal(Schema.identifier, "test.42");
				assert.equal(allowsUnknownOptionalFields(Schema), true);
				assert.deepEqual(calls, ["base", "override"]);
			});

			it("keeps the base result when the override returns undefined", () => {
				const composed = compose(
					{
						objectOptions: () => ({ allowUnknownOptionalFields: true }),
					},
					{ objectOptions: () => undefined },
				);
				const sf = new Factory({ ...composed, scope: "test" });
				assert.equal(allowsUnknownOptionalFields(sf.object("Foo", {})), true);
			});

			for (const position of ["base", "override"] as const) {
				it(`propagates errors from the ${position} callback`, () => {
					const error = new Error(position);
					const options: SchemaFactoryBetaOptions = {
						objectOptions: () => {
							throw error;
						},
					};
					const composed = position === "base" ? compose(options, {}) : compose({}, options);
					assert.throws(
						() => composed.objectOptions?.("Object", {}, undefined),
						(actual) => actual === error,
					);
				});
			}
		});
	}

	it("preserves alpha-only options through the shared composition implementation", () => {
		const composed = composeSchemaFactoryAlphaOptions(
			{
				objectOptions: (_name, _fields, options) => ({
					persistedMetadata: { base: true },
					...options,
				}),
			},
			{
				objectOptions: (_name, _fields, options) => ({
					...options,
					persistedMetadata: { ...options?.persistedMetadata, override: true },
				}),
			},
		);
		const sf = new SchemaFactoryAlpha({ scope: "test", ...composed });
		const Schema = sf.objectAlpha(
			"Alpha",
			{},
			{
				metadata: { custom: { count: 42 } },
			},
		);
		assert.deepEqual(Schema.persistedMetadata, { base: true, override: true });
		assert.equal(Schema.metadata.custom?.count, 42);
	});
});
