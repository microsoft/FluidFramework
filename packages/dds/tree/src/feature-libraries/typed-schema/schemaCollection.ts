/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type Adapters,
	type TreeAdapter,
	type TreeNodeSchemaIdentifier,
	Multiplicity,
} from "../../core/index.js";
import { fail, type requireAssignableTo } from "../../util/index.js";
import { FieldKinds, defaultSchemaPolicy } from "../default-schema/index.js";

import { normalizeFlexListEager } from "./flexList.js";
import {
	FlexFieldNodeSchema,
	type FlexFieldSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	type FlexTreeNodeSchema,
	LeafNodeSchema,
	type SchemaCollection,
	allowedTypesIsAny,
} from "./typedTreeSchema.js";
import type { Sourced } from "./view.js";

// TODO: tests for this file

/**
 * Schema data collected by a single SchemaBuilder (does not include referenced libraries).
 * @internal
 */
export interface SchemaLibraryData extends SchemaCollection {
	readonly name: string;
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
 * @internal
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
 *
 * @param name - Name of the resulting library.
 * @param lintConfiguration - configuration for what errors to generate.
 * @param libraries - Data to aggregate into the SchemaCollection.
 * @param rootFieldSchema - Only validated: not included in the result.
 *
 * @privateRemarks
 * This checks that input works with defaultSchemaPolicy.
 * If support fo other policies is added, this will need to take in the policy.
 */
export function aggregateSchemaLibraries(
	name: string,
	lintConfiguration: SchemaLintConfiguration,
	libraries: Iterable<SchemaLibraryData>,
	rootFieldSchema?: FlexFieldSchema,
): SchemaLibraryData {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, FlexTreeNodeSchema> = new Map();
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

		for (const [key, tree] of library.nodeSchema) {
			// This check is an assert since if it fails, the other error messages would be incorrect.
			assert(
				tree.builder.name === library.name,
				0x6a9 /* tree must be part by the library its in */,
			);
			const existing = nodeSchema.get(key);
			if (existing !== undefined) {
				errors.push(
					`Multiple tree schema for identifier "${key}". One from library "${existing.builder.name}" and one from "${tree.builder.name}"`,
				);
			} else {
				nodeSchema.set(key, tree);
			}
		}
		for (const _adapter of library.adapters.tree ?? []) {
			fail("Adapters not yet supported");
		}
	}

	if (errors.length !== 0) {
		fail(errors.join("\n"));
	}

	const result = { rootFieldSchema, nodeSchema, adapters, policy: defaultSchemaPolicy };
	const errors2 = validateSchemaCollection(lintConfiguration, result, rootFieldSchema);
	if (errors2.length !== 0) {
		fail(errors2.join("\n"));
	}

	return {
		name,
		nodeSchema,
		adapters,
	};
}

/**
 * Returns an array of descriptions of errors in the collection.
 *
 * As much as possible tries to detect anything that might be a mistake made by the schema author.
 * This will error on some valid but probably never intended to be used patterns (like never nodes).
 */
export function validateSchemaCollection(
	lintConfiguration: SchemaLintConfiguration,
	collection: SchemaCollection,
	rootFieldSchema?: FlexFieldSchema,
): string[] {
	const errors: string[] = [];

	// TODO: make this check specific to document schema. Replace check here for no tre or field schema (empty library).
	if (collection.nodeSchema.size === 0 && lintConfiguration.rejectEmpty) {
		errors.push("No tree schema are included, meaning no data can possibly be stored.");
	}

	// Validate that all schema referenced are included, and none are "never".
	if (rootFieldSchema !== undefined) {
		validateRootField(lintConfiguration, collection, rootFieldSchema, errors);
	}
	for (const [identifier, tree] of collection.nodeSchema) {
		if (tree instanceof FlexMapNodeSchema) {
			validateField(
				lintConfiguration,
				collection,
				tree.info,
				() => `Map fields of "${identifier}" schema from library "${tree.builder.name}"`,
				errors,
			);
			if ((tree.info.kind.multiplicity as Multiplicity) === Multiplicity.Single) {
				errors.push(
					`Map fields of "${identifier}" schema from library "${tree.builder.name}" has kind with multiplicity "Single". This is invalid since it requires all possible field keys to have a value under them.`,
				);
			}
		} else if (tree instanceof LeafNodeSchema) {
			// No validation for now.
		} else if (tree instanceof FlexFieldNodeSchema) {
			const description = (): string =>
				`Field node field of "${identifier}" schema from library "${tree.builder.name}"`;
			validateField(lintConfiguration, collection, tree.info, description, errors);
		} else if (tree instanceof FlexObjectNodeSchema) {
			for (const [key, field] of tree.objectNodeFields) {
				const description = (): string =>
					`Object node field "${key}" of "${identifier}" schema from library "${tree.builder.name}"`;
				validateField(lintConfiguration, collection, field, description, errors);
			}
		} else {
			// TODO: there should be a common fallback that works for cases without a specialized implementation.
			fail("unrecognized node kind");
		}
	}

	// TODO: validate adapters
	return errors;
}

export function validateRootField(
	lintConfiguration: SchemaLintConfiguration,
	collection: SchemaCollection,
	field: FlexFieldSchema,
	errors: string[],
): void {
	const describeField = (): string => `Root field schema`;
	validateField(lintConfiguration, collection, field, describeField, errors);
}

export function validateField(
	lintConfiguration: SchemaLintConfiguration,
	collection: SchemaCollection,
	field: FlexFieldSchema,
	describeField: () => string,
	errors: string[],
): void {
	const types = field.allowedTypes;
	if (!allowedTypesIsAny(types)) {
		const normalizedTypes = normalizeFlexListEager(types);
		for (const type of normalizedTypes) {
			const referenced = collection.nodeSchema.get(type.name);
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
