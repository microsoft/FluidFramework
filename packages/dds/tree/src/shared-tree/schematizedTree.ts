/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	AllowedUpdateType,
	Compatibility,
	TreeStoredSchema,
	ITreeCursorSynchronous,
	schemaDataIsEmpty,
} from "../core/index.js";
import {
	defaultSchemaPolicy,
	FieldKinds,
	allowsRepoSuperset,
	FlexTreeSchema,
	FlexFieldSchema,
	ViewSchema,
	InsertableFlexField,
	intoStoredSchema,
} from "../feature-libraries/index.js";
import { ITreeCheckout, TreeCheckout } from "./treeCheckout.js";

/**
 * Modify `storedSchema` and invoke `setInitialTree` when it's time to set the tree content.
 *
 * Requires `storedSchema` to be in its default/empty state.
 *
 * This is done in such a way that if the content (implicitly assumed to start empty)
 * is never out of schema.
 * This means that if the root field of the new schema requires content (like a value field),
 * a temporary intermediate schema is used so the initial empty state is not out of schema.
 *
 * Since this makes multiple changes, callers may want to wrap it in a transaction.
 */
export function initializeContent(
	schemaRepository: {
		storedSchema: ITreeCheckout["storedSchema"];
		updateSchema: ITreeCheckout["updateSchema"];
	},
	newSchema: FlexTreeSchema,
	setInitialTree: () => void,
): void {
	assert(
		schemaDataIsEmpty(schemaRepository.storedSchema),
		0x743 /* cannot initialize after a schema is set */,
	);

	const schema = intoStoredSchema(newSchema);
	const rootSchema = schema.rootFieldSchema;
	const rootKind = rootSchema.kind.identifier;

	// To keep the data in schema during the update, first define a schema that tolerates the current (empty) tree as well as the final (initial) tree.
	let incrementalSchemaUpdate: TreeStoredSchema;
	if (
		rootKind === FieldKinds.sequence.identifier ||
		rootKind === FieldKinds.optional.identifier
	) {
		// These kinds are known to tolerate empty, so use the schema as is:
		incrementalSchemaUpdate = schema;
	} else {
		assert(rootKind === FieldKinds.required.identifier, 0x5c8 /* Unexpected kind */);
		// Replace value kind with optional kind in root field schema:
		incrementalSchemaUpdate = {
			nodeSchema: schema.nodeSchema,
			rootFieldSchema: {
				kind: FieldKinds.optional,
				types: rootSchema.types,
			},
		};
	}

	// TODO: fix issues with schema comparison and enable this.
	// assert(
	// 	allowsRepoSuperset(defaultSchemaPolicy, tree.storedSchema, incrementalSchemaUpdate),
	// 	"Incremental Schema update should support the existing empty tree",
	// );
	assert(
		allowsRepoSuperset(defaultSchemaPolicy, schema, incrementalSchemaUpdate),
		0x5c9 /* Incremental Schema during update should be a allow a superset of the final schema */,
	);
	// Update to intermediate schema
	schemaRepository.updateSchema(incrementalSchemaUpdate);
	// Insert initial tree
	setInitialTree();

	// If intermediate schema is not final desired schema, update to the final schema:
	if (incrementalSchemaUpdate !== schema) {
		schemaRepository.updateSchema(schema);
	}
}

export function evaluateUpdate(
	viewSchema: ViewSchema,
	allowedSchemaModifications: AllowedUpdateType,
	storedSchema: TreeStoredSchema,
): Compatibility {
	const compatibility = viewSchema.checkCompatibility(storedSchema);
	switch (allowedSchemaModifications) {
		case AllowedUpdateType.None: {
			if (compatibility.read !== Compatibility.Compatible) {
				// Existing stored schema permits trees which are incompatible with the view schema
				return Compatibility.Compatible;
			}

			if (compatibility.write !== Compatibility.Compatible) {
				// TODO: support readonly mode in this case.
				// View schema permits trees which are incompatible with the stored schema
				return Compatibility.Compatible;
			}

			return Compatibility.Compatible;
		}
		case AllowedUpdateType.SchemaCompatible: {
			if (compatibility.read !== Compatibility.Compatible) {
				// Existing stored schema permits trees which are incompatible with the view schema, so schema can not be updated
				return Compatibility.Compatible;
			}
			if (compatibility.write !== Compatibility.Compatible) {
				return Compatibility.RequiresAdapters;
			}

			return Compatibility.Compatible;
		}
		default: {
			unreachableCase(allowedSchemaModifications);
		}
	}
}

// TODO: move this off tree
export function ensureSchema(
	viewSchema: ViewSchema,
	allowedSchemaModifications: AllowedUpdateType,
	checkout: TreeCheckout,
): boolean {
	const compatibility = evaluateUpdate(
		viewSchema,
		allowedSchemaModifications,
		checkout.storedSchema,
	);
	switch (compatibility) {
		case Compatibility.Compatible: {
			return true;
		}
		case Compatibility.Incompatible: {
			return false;
		}
		case Compatibility.RequiresAdapters: {
			checkout.updateSchema(intoStoredSchema(viewSchema.schema));
			return true;
		}
		default: {
			unreachableCase(compatibility);
		}
	}
}

/**
 * View Schema for a `SharedTree`.
 *
 * @internal
 */
export interface SchemaConfiguration<TRoot extends FlexFieldSchema = FlexFieldSchema> {
	/**
	 * The schema which the application wants to view the tree with.
	 */
	readonly schema: FlexTreeSchema<TRoot>;
}

/**
 * Content that can populate a `SharedTree`.
 *
 * @internal
 */
export interface TreeContent<TRoot extends FlexFieldSchema = FlexFieldSchema>
	extends SchemaConfiguration<TRoot> {
	/**
	 * Default tree content to initialize the tree with iff the tree is uninitialized
	 * (meaning it does not even have any schema set at all).
	 */
	readonly initialTree:
		| InsertableFlexField<TRoot>
		| readonly ITreeCursorSynchronous[]
		| ITreeCursorSynchronous;
}

/**
 * Options used to schematize a `SharedTree`.
 *
 * @internal
 */
export interface SchematizeConfiguration<TRoot extends FlexFieldSchema = FlexFieldSchema>
	extends SchemaConfiguration<TRoot> {
	/**
	 * Controls if and how schema from existing documents can be updated to accommodate the view schema.
	 */
	readonly allowedSchemaModifications: AllowedUpdateType;
}

/**
 * Options used to initialize (if needed) and schematize a `SharedTree`.
 *
 * @internal
 */
export interface InitializeAndSchematizeConfiguration<
	TRoot extends FlexFieldSchema = FlexFieldSchema,
> extends TreeContent<TRoot>,
		SchematizeConfiguration<TRoot> {}

/**
 * Options used to initialize (if needed) and schematize a `SharedTree`.
 * @remarks
 * Using this builder improves type safety and error quality over just constructing the configuration as a object.
 * @internal
 */
export function buildTreeConfiguration<T extends FlexFieldSchema>(
	config: InitializeAndSchematizeConfiguration<T>,
): InitializeAndSchematizeConfiguration<T> {
	return config;
}
