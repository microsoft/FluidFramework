/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Adapters, TreeSchemaIdentifier } from "../../core";
import { FullSchemaPolicy, SchemaCollection } from "../modular-schema";
import { fail } from "../../util";
import { defaultSchemaPolicy, FieldKinds } from "../default-field-kinds";
import { SchemaLibraryData, SourcedAdapters } from "./schemaBuilder";
import { FieldSchema, TreeSchema, allowedTypesIsAny } from "./typedTreeSchema";
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
	let rootFieldSchema: FieldSchema | undefined;
	const treeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();
	const adapters: SourcedAdapters = { tree: [] };

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

		if (library.rootFieldSchema !== undefined) {
			if (rootFieldSchema !== undefined) {
				errors.push(`Multiple root field schema`);
			} else {
				rootFieldSchema = library.rootFieldSchema;
			}
		}
		for (const [key, tree] of library.treeSchema) {
			// This check is an assert since if it fails, the other error messages would be incorrect.
			assert(
				tree.builder.name === library.name,
				0x6a9 /* tree must be part by the library its in */,
			);
			const existing = treeSchema.get(key);
			if (existing !== undefined) {
				errors.push(
					`Multiple tree schema for identifier "${key}". One from library "${existing.builder.name}" and one from "${tree.builder.name}"`,
				);
			} else {
				treeSchema.set(key, tree);
			}
		}
		for (const _adapter of library.adapters.tree ?? []) {
			fail("Adapters not yet supported");
		}
	}

	if (errors.length !== 0) {
		fail(errors.join("\n"));
	}

	assert(rootFieldSchema !== undefined, "missing root field schema");
	const result = { rootFieldSchema, treeSchema, adapters, policy: defaultSchemaPolicy };
	const errors2 = validateViewSchemaCollection(result);
	if (errors2.length !== 0) {
		fail(errors2.join("\n"));
	}
	return result;
}

export interface ViewSchemaCollection2 {
	readonly rootFieldSchema?: FieldSchema;
	readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
	readonly policy: FullSchemaPolicy;
	readonly adapters: Adapters;
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
	if (collection.rootFieldSchema !== undefined) {
		validateRootField(collection, collection.rootFieldSchema, errors);
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
			if (tree.extraLocalFields.kind === FieldKinds.value) {
				errors.push(
					`Extra local fields of "${identifier}" schema from library "${tree.builder.name}" has kind "value". This is invalid since it requires all possible local field keys to have a value under them.`,
				);
			}
		}
	}

	// TODO: validate adapters
	return errors;
}

export function validateRootField(
	collection: ViewSchemaCollection2,
	field: FieldSchema,
	errors: string[],
): void {
	const describeField = () => `Root field schema`;
	validateField(collection, field, describeField, errors);
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
	} else if (kind === FieldKinds.forbidden) {
		errors.push(
			`${describeField()} explicitly uses "forbidden" kind, which is not recommended.`,
		);
	} // else if (kind !== counter) {
	// 	errors.push(
	// 		`${describeField()} explicitly uses "counter" kind, which is finished.`,
	// 	);
	// }
}
