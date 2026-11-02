/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactory,
	SchemaFactoryAlpha,
	SchemaFactoryBeta,
	getSimpleSchema,
	NodeKind,
	type SchemaFactoryAlphaOptions,
	type SchemaFactoryBetaOptions,
	type TreeNodeSchema,
} from "../../../simple-tree/index.js";
import type { areSafelyAssignable, requireFalse, requireTrue } from "../../../util/index.js";

function allowsUnknownOptionalFields(schema: TreeNodeSchema): boolean {
	const simple = getSimpleSchema(schema).definitions.get(schema.identifier);
	assert(simple?.kind === NodeKind.Object);
	return simple.allowUnknownOptionalFields;
}

describe("schemaFactoryOptions", () => {
	for (const Factory of [SchemaFactory, SchemaFactoryBeta, SchemaFactoryAlpha]) {
		describe(Factory.name, () => {
			it("uses built-in defaults without adding them to sparse factory settings", () => {
				for (const settings of [
					undefined,
					{},
					{ objectOptions: {} },
					{ objectOptions: { allowUnknownOptionalFields: undefined } },
				]) {
					const sf: SchemaFactory = new Factory(
						settings === undefined ? "test" : { scope: "test", ...settings },
					);
					assert.equal(sf.settings.objectOptions, settings?.objectOptions);
					for (const factory of [
						sf,
						sf.scopedFactory("child"),
						sf.scopedFactory("replacement", {}),
					]) {
						assert.equal(allowsUnknownOptionalFields(factory.object("Object", {})), false);
						assert.equal(
							allowsUnknownOptionalFields(factory.objectRecursive("Recursive", {})),
							false,
						);
					}
				}
			});

			it("distinguishes omitted options from explicit undefined properties", () => {
				const sf: SchemaFactory = new Factory({
					scope: "test",
					objectOptions: { allowUnknownOptionalFields: true },
				});
				for (const [options, expected] of [
					[undefined, true],
					[{ allowUnknownOptionalFields: undefined }, false],
				] as const) {
					assert.equal(
						allowsUnknownOptionalFields(sf.object("Object", {}, options)),
						expected,
					);
					assert.equal(
						allowsUnknownOptionalFields(sf.objectRecursive("Recursive", {}, options)),
						expected,
					);
				}
				assert.equal(sf.settings.objectOptions?.allowUnknownOptionalFields, true);
			});

			it("does not mutate defaults or per-schema options", () => {
				const defaults = Object.freeze({ allowUnknownOptionalFields: true });
				const perSchema = Object.freeze({ allowUnknownOptionalFields: false });
				const sf: SchemaFactory = new Factory({ scope: "test", objectOptions: defaults });
				assert.equal(allowsUnknownOptionalFields(sf.object("Override", {}, perSchema)), false);
				assert.equal(
					allowsUnknownOptionalFields(sf.objectRecursive("RecursiveOverride", {}, perSchema)),
					false,
				);
				assert.deepEqual(defaults, { allowUnknownOptionalFields: true });
				assert.deepEqual(perSchema, { allowUnknownOptionalFields: false });
			});

			it("uses factory defaults when the per-schema options bag is empty", () => {
				const sf: SchemaFactory = new Factory({
					scope: "test",
					objectOptions: { allowUnknownOptionalFields: true },
				});
				assert.equal(allowsUnknownOptionalFields(sf.object("Object", {}, {})), true);
				assert.equal(
					allowsUnknownOptionalFields(sf.objectRecursive("Recursive", {}, {})),
					true,
				);
			});
		});
	}

	for (const Factory of [SchemaFactoryBeta, SchemaFactoryAlpha]) {
		describe(`${Factory.name} metadata defaults`, () => {
			it("preserves defaults when callers extend a child factory's options", () => {
				const sf = new Factory({
					scope: "test",
					objectOptions: {
						allowUnknownOptionalFields: true,
						metadata: { description: "factory default" },
					},
				});
				const child = sf.scopedFactory("child", {
					...sf.settings,
					objectOptions: {
						...sf.settings.objectOptions,
						allowUnknownOptionalFields: false,
					},
				});
				const Schema = child.object("Child", {});
				assert.equal(allowsUnknownOptionalFields(Schema), false);
				assert.equal(Schema.metadata.description, "factory default");
			});

			it("replaces metadata without changing per-schema custom metadata typing", () => {
				const sf = new Factory({
					scope: "test",
					objectOptions: {
						allowUnknownOptionalFields: true,
						metadata: { description: "factory default" },
					},
				});
				const Schema = sf.object("Object", {}, { metadata: { custom: { count: 42 } } });
				assert.equal(allowsUnknownOptionalFields(Schema), true);
				assert.equal(Schema.metadata.description, undefined);
				assert.equal(Schema.metadata.custom?.count, 42);
				type _check = requireTrue<
					areSafelyAssignable<typeof Schema.metadata.custom, { count: 42 } | undefined>
				>;
			});
		});
	}

	it("uses built-in defaults for alpha object methods when options are omitted or cleared", () => {
		const sf = new SchemaFactoryAlpha("test");
		const configured = new SchemaFactoryAlpha({
			scope: "test",
			objectOptions: { allowUnknownOptionalFields: true },
		});
		const cleared = { allowUnknownOptionalFields: undefined };
		for (const Schema of [
			sf.objectAlpha("Object", {}),
			sf.objectRecursiveAlpha("Recursive", {}),
			configured.objectAlpha("Cleared", {}, cleared),
			configured.objectRecursiveAlpha("ClearedRecursive", {}, cleared),
		]) {
			assert.equal(Schema.allowUnknownOptionalFields, false);
		}
		assert.equal(configured.settings.objectOptions?.allowUnknownOptionalFields, true);
	});

	it("shallowly replaces alpha persisted metadata while preserving other defaults", () => {
		const sf = new SchemaFactoryAlpha({
			scope: "test",
			objectOptions: {
				allowUnknownOptionalFields: true,
				metadata: { description: "factory default" },
				persistedMetadata: { original: true },
			},
		});
		const options = { persistedMetadata: { override: true } };
		for (const Schema of [
			sf.objectAlpha("Alpha", {}, options),
			sf.objectRecursive("Recursive", {}, options),
			sf.objectRecursiveAlpha("RecursiveAlpha", {}, options),
		]) {
			assert.equal(Schema.allowUnknownOptionalFields, true);
			assert.equal(Schema.metadata.description, "factory default");
			assert.deepEqual(Schema.persistedMetadata, { override: true });
		}
		assert.deepEqual(sf.settings.objectOptions?.persistedMetadata, { original: true });
	});

	it("keeps factory options readonly and excludes per-schema custom metadata", () => {
		interface CustomMetadataDefaults {
			objectOptions: { metadata: { custom: { count: number } } };
		}
		type _beta = requireFalse<
			areSafelyAssignable<CustomMetadataDefaults, SchemaFactoryBetaOptions>
		>;
		type _alpha = requireFalse<
			areSafelyAssignable<CustomMetadataDefaults, SchemaFactoryAlphaOptions>
		>;
		const sf = new SchemaFactoryBeta({
			scope: "test",
			objectOptions: { allowUnknownOptionalFields: true },
		});
		// eslint-disable-next-line no-constant-condition -- Type-check readonly settings without mutating them.
		if (false) {
			// @ts-expect-error Factory settings are readonly.
			sf.settings.objectOptions = {};
			if (sf.settings.objectOptions !== undefined) {
				// @ts-expect-error Object defaults are readonly.
				sf.settings.objectOptions.allowUnknownOptionalFields = false;
			}
		}
	});
});
