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
				for (const settings of [undefined, {}, { objectOptions: {} }]) {
					const sf: SchemaFactory = new Factory(
						settings === undefined ? "test" : { scope: "test", ...settings },
					);
					assert.equal(sf.settings.objectOptions, settings?.objectOptions);
					for (const factory of [
						sf,
						sf.scopedFactory("child"),
						sf.scopedFactory("empty", {}),
					]) {
						assert.equal(allowsUnknownOptionalFields(factory.object("Object", {})), false);
						assert.equal(
							allowsUnknownOptionalFields(factory.objectRecursive("Recursive", {})),
							false,
						);
					}
				}
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

			it("inherits defaults when derived settings are omitted or empty", () => {
				const sf: SchemaFactory = new Factory({
					scope: "test",
					objectOptions: { allowUnknownOptionalFields: true },
				});
				for (const settings of [undefined, {}, { objectOptions: {} }]) {
					const child = sf.scopedFactory("child", settings);
					assert.equal(allowsUnknownOptionalFields(child.object("Object", {})), true);
					assert.equal(
						allowsUnknownOptionalFields(child.objectRecursive("Recursive", {})),
						true,
					);
					assert.equal(
						allowsUnknownOptionalFields(
							child.scopedFactory("nested", {}).object("Nested", {}),
						),
						true,
					);
				}
			});
		});
	}

	for (const Factory of [SchemaFactoryBeta, SchemaFactoryAlpha]) {
		describe(`${Factory.name} metadata defaults`, () => {
			it("merges partial child settings without mutating either input", () => {
				const defaults = Object.freeze({
					allowUnknownOptionalFields: true,
					metadata: Object.freeze({ description: "factory default" }),
				});
				const sf = new Factory({
					scope: "test",
					objectOptions: defaults,
				});
				Object.freeze(sf.settings);
				const settings = Object.freeze({
					objectOptions: Object.freeze({ allowUnknownOptionalFields: false }),
				});
				const child = sf.scopedFactory("child", settings);
				const Schema = child.object("Child", {});
				assert.equal(allowsUnknownOptionalFields(Schema), false);
				assert.equal(Schema.metadata.description, "factory default");
				const Original = sf.object("Original", {});
				assert.equal(allowsUnknownOptionalFields(Original), true);
				assert.equal(Original.metadata.description, "factory default");

				const nested = child.scopedFactory("nested", {
					objectOptions: { metadata: { description: "nested" } },
				});
				const Nested = nested.object("Nested", {});
				assert.equal(allowsUnknownOptionalFields(Nested), false);
				assert.equal(Nested.metadata.description, "nested");
				assert.equal(Schema.metadata.description, "factory default");
			});

			it("replaces supplied child metadata as a whole while inheriting other options", () => {
				const sf = new Factory({
					scope: "test",
					objectOptions: {
						allowUnknownOptionalFields: true,
						metadata: { description: "factory default" },
					},
				});
				const child = sf.scopedFactory("child", { objectOptions: { metadata: {} } });
				const Schema = child.object("Child", {});
				assert.equal(allowsUnknownOptionalFields(Schema), true);
				assert.deepEqual(Schema.metadata, {});
				assert.equal(sf.object("Original", {}).metadata.description, "factory default");
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

	it("uses built-in defaults for alpha object methods when options are omitted", () => {
		const sf = new SchemaFactoryAlpha("test");
		for (const Schema of [
			sf.objectAlpha("Object", {}),
			sf.objectRecursiveAlpha("Recursive", {}),
		]) {
			assert.equal(Schema.allowUnknownOptionalFields, false);
		}
	});

	it("replaces child persisted metadata as a whole while inheriting other alpha options", () => {
		const sf = new SchemaFactoryAlpha({
			scope: "test",
			objectOptions: {
				allowUnknownOptionalFields: true,
				metadata: { description: "factory default" },
				persistedMetadata: { parent: true },
			},
		});
		const child = sf.scopedFactory("child", {
			objectOptions: { persistedMetadata: { child: true } },
		});
		for (const Schema of [
			child.objectAlpha("Alpha", {}),
			child.objectRecursive("Recursive", {}),
			child.objectRecursiveAlpha("RecursiveAlpha", {}),
		]) {
			assert.equal(Schema.allowUnknownOptionalFields, true);
			assert.equal(Schema.metadata.description, "factory default");
			assert.deepEqual(Schema.persistedMetadata, { child: true });
		}
		assert.deepEqual(sf.objectAlpha("Original", {}).persistedMetadata, { parent: true });
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
