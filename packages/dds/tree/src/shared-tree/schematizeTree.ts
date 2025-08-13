/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import { type TreeStoredSchema, rootFieldKey, schemaDataIsEmpty } from "../core/index.js";
import {
	FieldKinds,
	allowsRepoSuperset,
	defaultSchemaPolicy,
	type IDefaultEditBuilder,
	type TreeChunk,
} from "../feature-libraries/index.js";

import type { ITreeCheckout } from "./treeCheckout.js";

export function canInitialize(checkout: ITreeCheckout): boolean {
	// Check for empty.
	return checkout.forest.isEmpty && schemaDataIsEmpty(checkout.storedSchema);
}

/**
 * Initialize a checkout with a schema and tree content.
 * This function should only be called when the tree is uninitialized (no schema or content).
 *
 * @param checkout - The tree checkout to initialize.
 * @param newSchema - The new schema to apply.
 * @param contentFactory - A function that sets the initial tree content.
 * Invoked after a schema containing all nodes from newSchema is applied.
 * Note that the final root field schema may not have been applied yet: if the root is required, it will be optional at this time
 * (so the root being empty before the insertion is not out of schema).
 * @remarks
 * If `newSchema` is not compatible with the empty tree, this function handles it using an intermediate schema
 * which supports the empty tree as well as the final tree content.
 * @privateRemarks
 * This takes in a checkout using a subset of the checkout interface to enable easier unit testing.
 */
export function initialize(
	checkout: Pick<ITreeCheckout, "storedSchema" | "updateSchema">,
	newSchema: TreeStoredSchema,
	setInitialTree: () => void,
): void {
	assert(
		schemaDataIsEmpty(checkout.storedSchema),
		0x743 /* cannot initialize after a schema is set */,
	);

	// To keep the data in schema during the update, first define a schema that tolerates the current (empty) tree as well as the final (initial) tree.
	let incrementalSchemaUpdate: TreeStoredSchema;
	{
		const rootSchema = newSchema.rootFieldSchema;
		const rootKind = rootSchema.kind;
		if (
			rootKind === FieldKinds.sequence.identifier ||
			rootKind === FieldKinds.optional.identifier
		) {
			// These kinds are known to tolerate empty, so use the schema as is:
			incrementalSchemaUpdate = newSchema;
		} else {
			assert(rootKind === FieldKinds.required.identifier, 0x5c8 /* Unexpected kind */);
			// Replace value kind with optional kind in root field schema:
			incrementalSchemaUpdate = {
				nodeSchema: newSchema.nodeSchema,
				rootFieldSchema: {
					kind: FieldKinds.optional.identifier,
					types: rootSchema.types,
					persistedMetadata: rootSchema.persistedMetadata,
				},
			};
		}
	}

	assert(
		allowsRepoSuperset(defaultSchemaPolicy, newSchema, incrementalSchemaUpdate),
		0x5c9 /* Incremental Schema during update should allow a superset of the final schema */,
	);

	// Update to intermediate schema
	checkout.updateSchema(incrementalSchemaUpdate);

	// Insert initial tree
	setInitialTree();

	// If intermediate schema is not final desired schema, update to the final schema:
	if (incrementalSchemaUpdate !== newSchema) {
		// This makes the root more strict, so set allowNonSupersetSchema to true.
		checkout.updateSchema(newSchema, true);
	}
}

/**
 * Construct a general purpose `setInitialTree` for use with {@link initialize} from a function that returns a chunk.
 * @param contentFactory - A function that returns the initial tree content as a chunk.
 * Invoked after a schema containing all nodes from newSchema is applied.
 * Note that the final root field schema may not have been applied yet: if the root is required, it will be optional at this time
 * (so the root being empty before the insertion is not out of schema).
 */
export function initializerFromChunk(
	checkout: Pick<ITreeCheckout, "storedSchema"> & {
		readonly editor: IDefaultEditBuilder;
	},
	contentFactory: () => TreeChunk,
): () => void {
	return () => initializeFromChunk(checkout, contentFactory);
}

function initializeFromChunk(
	checkout: Pick<ITreeCheckout, "storedSchema"> & {
		readonly editor: IDefaultEditBuilder;
	},
	contentFactory: () => TreeChunk,
): void {
	const contentChunk = contentFactory();
	const field = { field: rootFieldKey, parent: undefined };
	switch (checkout.storedSchema.rootFieldSchema.kind) {
		case FieldKinds.optional.identifier: {
			const fieldEditor = checkout.editor.optionalField(field);
			assert(
				contentChunk.topLevelLength <= 1,
				0x7f4 /* optional field content should normalize at most one item */,
			);
			fieldEditor.set(contentChunk.topLevelLength === 0 ? undefined : contentChunk, true);
			break;
		}
		// This case is not reachable from the public API, but the internal flex-tree abstraction layer can have sequence roots.
		case FieldKinds.sequence.identifier: {
			const fieldEditor = checkout.editor.sequenceField(field);
			// TODO: should do an idempotent edit here.
			fieldEditor.insert(0, contentChunk);
			break;
		}
		default: {
			fail(0xac7 /* unexpected root field kind during initialize */);
		}
	}
}
