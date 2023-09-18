/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Adapters, TreeAdapter, TreeSchemaIdentifier } from "../../core";
import { FullSchemaPolicy } from "../modular-schema";
import { capitalize, fail, requireAssignableTo } from "../../util";
import { defaultSchemaPolicy, FieldKinds, FieldKindTypes } from "../default-field-kinds";
import {
	FieldSchema,
	TreeSchema,
	allowedTypesIsAny,
	TypedSchemaCollection,
} from "./typedTreeSchema";
import { normalizeFlexListEager } from "./flexList";
import { Sourced } from "./view";

// TODO: tests for this file

/**
 * Schema data collected by a single SchemaBuilder (does not include referenced libraries).
 * @alpha
 */
export interface SchemaLibraryData {
	readonly name: string;
	readonly rootFieldSchema?: FieldSchema;
	readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
	readonly adapters: Adapters;
}

/**
 * Mutable adapter collection which records the associated factory.
 * See {@link Adapters}.
 */
export interface SourcedAdapters {
	readonly tree: (Sourced & TreeAdapter)[];
}

{
	type _check = requireAssignableTo<SourcedAdapters, Adapters>;
}

/**
 * Allows opting into and out of errors for some unusual schema patterns which are usually bugs.
 * @alpha
 */
export interface SchemaLintConfiguration {
	readonly rejectForbidden: boolean;
	readonly rejectEmpty: boolean;
}

export const schemaLintDefault: SchemaLintConfiguration = {
	rejectForbidden: true,
	rejectEmpty: true,
};

/**
 * Build and validate a SchemaCollection.
 *
 * As much as possible tries to detect anything that might be a mistake made by the schema author.
 * This will error on some valid but probably never intended to be used patterns
 * (like libraries with the same name, nodes which are impossible to create etc).
 */
export function buildViewSchemaCollection(
	lintConfiguration: SchemaLintConfiguration,
	libraries: Iterable<SchemaLibraryData>,
): TypedSchemaCollection {
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

	const result = { rootFieldSchema, treeSchema, adapters, policy: defaultSchemaPolicy };
	const errors2 = validateViewSchemaCollection(lintConfiguration, result);
	if (errors2.length !== 0) {
		fail(errors2.join("\n"));
	}

	return {
		// The returned value here needs to implement the SchemaData interface (which SchemaCollection extends).
		// This means it must have a rootFieldSchema.
		// In the case where this SchemaCollection is a library and not a full document schema,
		// no caller provided rootFieldSchema is available and a "forbidden" field is used instead.
		// Thus a library can be used as SchemaData, but if used for full document's SchemaData,
		// the document will be forced to be empty (due to having an empty root field):
		// this seems unlikely to cause issues in practice, and results in convenient type compatibility.
		rootFieldSchema: rootFieldSchema ?? new FieldSchema(FieldKinds.forbidden, []),
		treeSchema,
		adapters,
		policy: defaultSchemaPolicy,
	};
}

/**
 * View Schema information collected from a SchemaBuilder.
 * Internal type for unifying document schema and libraries for use in validation and conversion.
 */
export interface ViewSchemaCollection {
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
export function validateViewSchemaCollection(
	lintConfiguration: SchemaLintConfiguration,
	collection: ViewSchemaCollection,
): string[] {
	const errors: string[] = [];

	// TODO: make this check specific to document schema. Replace check here for no tre or field schema (empty library).
	if (collection.treeSchema.size === 0 && lintConfiguration.rejectEmpty) {
		errors.push("No tree schema are included, meaning no data can possibly be stored.");
	}

	if (collection.policy !== defaultSchemaPolicy) {
		errors.push("Unexpected policy.");
	}

	// Validate that all schema referenced are included, and none are "never".
	if (collection.rootFieldSchema !== undefined) {
		validateRootField(lintConfiguration, collection, collection.rootFieldSchema, errors);
	}
	for (const [identifier, tree] of collection.treeSchema) {
		for (const [key, field] of tree.structFields) {
			const description = () =>
				`Struct field "${key}" of "${identifier}" schema from library "${tree.builder.name}"`;
			validateField(lintConfiguration, collection, field, description, errors);
			validateStructFieldName(key, description, errors);
		}
		if (tree.mapFields !== undefined) {
			validateField(
				lintConfiguration,
				collection,
				tree.mapFields,
				() => `Map fields of "${identifier}" schema from library "${tree.builder.name}"`,
				errors,
			);
			if ((tree.mapFields.kind as FieldKindTypes) === FieldKinds.value) {
				errors.push(
					`Map fields of "${identifier}" schema from library "${tree.builder.name}" has kind "value". This is invalid since it requires all possible field keys to have a value under them.`,
				);
			}
		}
	}

	// TODO: validate adapters
	return errors;
}

export function validateRootField(
	lintConfiguration: SchemaLintConfiguration,
	collection: ViewSchemaCollection,
	field: FieldSchema,
	errors: string[],
): void {
	const describeField = () => `Root field schema`;
	validateField(lintConfiguration, collection, field, describeField, errors);
}

export function validateField(
	lintConfiguration: SchemaLintConfiguration,
	collection: ViewSchemaCollection,
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
		if (types.length === 0 && lintConfiguration.rejectEmpty) {
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
		if (lintConfiguration.rejectForbidden) {
			errors.push(
				`${describeField()} explicitly uses "forbidden" kind, which is not recommended.`,
			);
		}
	} // else if (kind !== counter) {
	// 	errors.push(
	// 		`${describeField()} explicitly uses "counter" kind, which is finished.`,
	// 	);
	// }
}

/**
 * Reserved field names to avoid collisions with the API.
 */
export const bannedFieldNames = new Set([
	"constructor",
	"context",
	"is",
	"on",
	"parentField",
	"schema",
	"treeStatus",
	"tryGetField",
	"type",
	"value",
]);

/**
 * Field names starting with these must not be followed by an upper case letter
 */
export const fieldApiPrefixes = new Set(["set", "boxed"]);

export function validateStructFieldName(
	name: string,
	describeField: () => string,
	errors: string[],
): void {
	// TODO: support custom field keys.
	const suggestion =
		"Pick a different field name to avoid property name collisions in the tree API. In the future, it will be possible to pick a separate field name for use in identifiers in the the API (to fix errors like this one) while keeping the field key (used everywhere else, including in persisted data) for compatibility but this is not implemented yet.";

	if (bannedFieldNames.has(name)) {
		errors.push(
			`${describeField()} uses one of the banned field names (${[
				...bannedFieldNames,
			]}). ${suggestion}`,
		);
	}

	for (const prefix of fieldApiPrefixes) {
		if (name.startsWith(prefix)) {
			const afterPrefix = name.slice(prefix.length);
			if (afterPrefix === capitalize(afterPrefix)) {
				errors.push(
					`${describeField()} has name that starts with one of the banned prefixes (${[
						...fieldApiPrefixes,
					]}) followed by something other than a lowercase letter. ${suggestion}`,
				);
			}
		}
	}
}
