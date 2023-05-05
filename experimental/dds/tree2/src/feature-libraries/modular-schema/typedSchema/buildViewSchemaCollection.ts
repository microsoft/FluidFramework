/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { GlobalFieldKey, TreeSchemaIdentifier } from "../../../core";
import { SchemaCollection } from "../view";
import { fail } from "../../../util";
import { defaultSchemaPolicy } from "../../defaultSchema";
import { forbidden, value } from "../../defaultFieldKinds";
import { SchemaLibraryData, SourcedAdapters } from "./schemaBuilder";
import { FieldSchema, GlobalFieldSchema, TreeSchema, allowedTypesIsAny } from "./typedTreeSchema";
import { normalizeFlexListEager } from "./flexList";

// TODO: tests for this file

/**
 * Build and validate a SchemaCollection.
 *
 * As much as possible tries to detect anything that might be a mistake made by the schema author.
 * This will error on some valid but probably never intended to be used patterns
 * (like libraries with the same name, nodes which are impossible to create etc).
 */
export function buildViewSchemaCollection(
	libraries: readonly SchemaLibraryData[],
): SchemaCollection {
	const globalFieldSchema: Map<GlobalFieldKey, GlobalFieldSchema> = new Map();
	const treeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();
	const adapters: SourcedAdapters = { tree: [], fieldAdapters: new Map() };

	const errors: string[] = [];
	const librarySet: Set<SchemaLibraryData> = new Set();
	const libraryNames: Set<string> = new Set();

	for (const library of libraries) {
		if (librarySet.has(library)) {
			// SchemaBuilder should ensure this doesn't happen, but include it here for completeness.
			errors.push(`Duplicate library named "${library.name}"`);
			continue;
		}
		librarySet.add(library);
		if (libraryNames.has(library.name)) {
			// This wouldn't break anything, but could make error messages confusing, so its better to avoid duplicates.
			errors.push(`Found another library with name "${library.name}"`);
		}

		for (const [key, field] of library.globalFieldSchema) {
			// This check is an assert since if it fails, the other error messages would be incorrect.
			assert(field.builder.name === library.name, "field must be part by the library its in");
			const existing = globalFieldSchema.get(key);
			if (existing !== undefined) {
				errors.push(
					`Multiple global field schema for key "${key}". One from library "${existing.builder.name}" and one from "${field.builder.name}"`,
				);
			} else {
				globalFieldSchema.set(key, field);
			}
		}
		for (const [key, tree] of library.treeSchema) {
			// This check is an assert since if it fails, the other error messages would be incorrect.
			assert(tree.builder.name === library.name, "tree must be part by the library its in");
			const existing = treeSchema.get(key);
			if (existing !== undefined) {
				errors.push(
					`Multiple tree schema for identifier "${key}". One from library "${existing.builder.name}" and one from "${tree.builder.name}"`,
				);
			} else {
				treeSchema.set(key, tree);
			}
		}
		for (const [_key, _adapter] of library.adapters.fieldAdapters ?? []) {
			fail("Adapters not yet supported");
		}
		for (const _adapter of library.adapters.tree ?? []) {
			fail("Adapters not yet supported");
		}
	}

	if (errors.length !== 0) {
		fail(errors.join("\n"));
	}

	const result = { globalFieldSchema, treeSchema, adapters, policy: defaultSchemaPolicy };
	const errors2 = validateViewSchemaCollection(result);
	if (errors2.length !== 0) {
		fail(errors2.join("\n"));
	}
	return result;
}

export interface ViewSchemaCollection2 extends SchemaCollection {
	readonly globalFieldSchema: ReadonlyMap<GlobalFieldKey, GlobalFieldSchema>;
	readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
}

/**
 * Returns an array of descriptions of errors in the collection.
 *
 * As much as possible tries to detect anything that might be a mistake made by the schema author.
 * This will error on some valid but probably never intended to be used patterns (like never nodes).
 */
export function validateViewSchemaCollection(collection: ViewSchemaCollection2): string[] {
	const errors: string[] = [];

	// TODO: make this check specific to document schema. Replace check here for no tre or field schema (empty library).
	if (collection.treeSchema.size === 0) {
		errors.push("No tree schema are included, meaning no data can possibly be stored.");
	}

	if (collection.policy !== defaultSchemaPolicy) {
		errors.push("Unexpected policy.");
	}

	// Validate that all schema referenced are included, and none are "never".
	for (const [key, field] of collection.globalFieldSchema) {
		assert(key === field.key, "field key should match map key");
		validateGlobalField(collection, field, errors);
	}
	for (const [identifier, tree] of collection.treeSchema) {
		for (const [key, field] of tree.localFields) {
			validateField(
				collection,
				field,
				() =>
					`Local field "${key}" of "${identifier}" schema from library "${tree.builder.name}"`,
				errors,
			);
		}
		if (tree.extraLocalFields !== FieldSchema.empty) {
			validateField(
				collection,
				tree.extraLocalFields,
				() =>
					`Extra local fields of "${identifier}" schema from library "${tree.builder.name}"`,
				errors,
			);
			if (tree.extraLocalFields.kind === value) {
				errors.push(
					`Extra local fields of "${identifier}" schema from library "${tree.builder.name}" has kind "value". This is invalid since it requires all possible local field keys to have a value under them.`,
				);
			}
		}
		for (const key of tree.globalFields) {
			if (!collection.globalFieldSchema.has(key)) {
				errors.push(
					`Tree schema "${identifier}" from library "${tree.builder.name}" references undefined global field "${key}".`,
				);
			}
		}
	}

	// TODO: validate adapters
	return errors;
}

export function validateGlobalField(
	collection: ViewSchemaCollection2,
	field: GlobalFieldSchema,
	errors: string[],
): void {
	const describeField = () =>
		`Global field schema "${field.key}" from library "${field.builder.name}"`;
	validateField(collection, field.schema, describeField, errors);
}

export function validateField(
	collection: ViewSchemaCollection2,
	field: FieldSchema,
	describeField: () => string,
	errors: string[],
): void {
	const types = field.allowedTypes;
	if (!allowedTypesIsAny(types)) {
		const normalizedTypes = normalizeFlexListEager(types);
		for (const type of normalizedTypes) {
			const referenced = collection.treeSchema.get(type.name);
			if (referenced === undefined) {
				errors.push(
					`${describeField()} references type "${type.name}" from library "${
						type.builder.name
					}" which is not defined. Perhaps another type was intended, or that library needs to be added.`,
				);
			}
		}
		if (types.length === 0) {
			errors.push(
				`${describeField()} requires children to have a type from a set of zero types. This means the field must always be empty.`,
			);
		}
	}

	const kind = field.kind;
	const kindFromPolicy = defaultSchemaPolicy.fieldKinds.get(kind.identifier);
	if (kindFromPolicy === undefined) {
		errors.push(`"${describeField()}" has unknown field kind "${kind.identifier}".`);
	} else if (kindFromPolicy !== kind) {
		errors.push(
			`${describeField()} has field kind "${
				kind.identifier
			}" which isn't a reference to the default kind with that identifier.`,
		);
	} else if (kind === forbidden) {
		errors.push(
			`${describeField()} explicitly uses "forbidden" kind, which is not recommended.`,
		);
	} // else if (kind !== counter) {
	// 	errors.push(
	// 		`${describeField()} explicitly uses "counter" kind, which is finished.`,
	// 	);
	// }
}
