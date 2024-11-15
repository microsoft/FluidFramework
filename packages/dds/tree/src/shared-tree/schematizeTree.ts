/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import {
	AllowedUpdateType,
	CursorLocationType,
	type ITreeCursorSynchronous,
	type TreeStoredSchema,
	rootFieldKey,
	schemaDataIsEmpty,
} from "../core/index.js";
import {
	FieldKinds,
	allowsRepoSuperset,
	cursorForMapTreeField,
	defaultSchemaPolicy,
	mapTreeFromCursor,
} from "../feature-libraries/index.js";
import { fail, isReadonlyArray } from "../util/index.js";

import type { ITreeCheckout } from "./treeCheckout.js";
import { toStoredSchema, type ViewSchema } from "../simple-tree/index.js";

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
	newSchema: TreeStoredSchema,
	setInitialTree: () => void,
): void {
	assert(
		schemaDataIsEmpty(schemaRepository.storedSchema),
		0x743 /* cannot initialize after a schema is set */,
	);

	const rootSchema = newSchema.rootFieldSchema;
	const rootKind = rootSchema.kind;

	// To keep the data in schema during the update, first define a schema that tolerates the current (empty) tree as well as the final (initial) tree.
	let incrementalSchemaUpdate: TreeStoredSchema;
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
			},
		};
	}

	// TODO: fix issues with schema comparison and enable this.
	// assert(
	// 	allowsRepoSuperset(defaultSchemaPolicy, tree.storedSchema, incrementalSchemaUpdate),
	// 	"Incremental Schema update should support the existing empty tree",
	// );
	assert(
		allowsRepoSuperset(defaultSchemaPolicy, newSchema, incrementalSchemaUpdate),
		0x5c9 /* Incremental Schema during update should be a allow a superset of the final schema */,
	);
	// Update to intermediate schema
	schemaRepository.updateSchema(incrementalSchemaUpdate);
	// Insert initial tree
	setInitialTree();

	// If intermediate schema is not final desired schema, update to the final schema:
	if (incrementalSchemaUpdate !== newSchema) {
		schemaRepository.updateSchema(newSchema);
	}
}

export enum UpdateType {
	/**
	 * Already compatible, no update needed.
	 */
	None,
	/**
	 * Empty: needs initializing.
	 */
	Initialize,
	/**
	 * Schema can be upgraded leaving tree as is.
	 */
	SchemaCompatible,
	/**
	 * No update currently supported.
	 */
	Incompatible,
}

export function evaluateUpdate(
	viewSchema: ViewSchema,
	allowedSchemaModifications: AllowedUpdateType,
	checkout: ITreeCheckout,
): UpdateType {
	const compatibility = viewSchema.checkCompatibility(checkout.storedSchema);

	if (compatibility.canUpgrade && compatibility.canView) {
		// Compatible as is
		return UpdateType.None;
	}

	// eslint-disable-next-line no-bitwise
	if (allowedSchemaModifications & AllowedUpdateType.Initialize && canInitialize(checkout)) {
		return UpdateType.Initialize;
	}

	if (!compatibility.canUpgrade) {
		// Existing stored schema permits trees which are incompatible with the view schema, so schema can not be updated
		return UpdateType.Incompatible;
	}

	assert(!compatibility.canView, 0x8bd /* unexpected case */);
	assert(compatibility.canUpgrade, 0x8be /* unexpected case */);

	// eslint-disable-next-line no-bitwise
	return allowedSchemaModifications & AllowedUpdateType.SchemaCompatible
		? UpdateType.SchemaCompatible
		: UpdateType.Incompatible;
}

export function canInitialize(checkout: ITreeCheckout): boolean {
	// Check for empty.
	return checkout.forest.isEmpty && schemaDataIsEmpty(checkout.storedSchema);
}

function normalizeNewFieldContent(
	content: readonly ITreeCursorSynchronous[] | ITreeCursorSynchronous | undefined,
): ITreeCursorSynchronous {
	if (content === undefined) {
		return cursorForMapTreeField([]);
	}

	if (isReadonlyArray(content)) {
		return cursorForMapTreeField(content.map((c) => mapTreeFromCursor(c)));
	}

	if (content.mode === CursorLocationType.Fields) {
		return content;
	}

	return cursorForMapTreeField([mapTreeFromCursor(content)]);
}

/**
 * Initialize a checkout with a schema and tree content.
 * This function should only be called when the tree is uninitialized (no schema or content).
 * @remarks
 *
 * If the proposed schema (from `treeContent`) is not compatible with the emptry tree, this function handles using an intermediate schema
 * which supports the empty tree as well as the final tree content.
 */
export function initialize(checkout: ITreeCheckout, treeContent: TreeStoredContent): void {
	checkout.transaction.start();
	try {
		initializeContent(checkout, treeContent.schema, () => {
			const field = { field: rootFieldKey, parent: undefined };
			const content = normalizeNewFieldContent(treeContent.initialTree);

			switch (checkout.storedSchema.rootFieldSchema.kind) {
				case FieldKinds.optional.identifier: {
					const fieldEditor = checkout.editor.optionalField(field);
					assert(
						content.getFieldLength() <= 1,
						0x7f4 /* optional field content should normalize at most one item */,
					);
					fieldEditor.set(content.getFieldLength() === 0 ? undefined : content, true);
					break;
				}
				case FieldKinds.sequence.identifier: {
					const fieldEditor = checkout.editor.sequenceField(field);
					// TODO: should do an idempotent edit here.
					fieldEditor.insert(0, content);
					break;
				}
				default: {
					fail("unexpected root field kind during initialize");
				}
			}
		});
	} finally {
		checkout.transaction.commit();
	}
}

/**
 * Ensure a {@link ITreeCheckout} can be used with a given {@link ViewSchema}.
 *
 * @remarks
 * It is up to the caller to ensure that compatibility is reevaluated if the checkout's stored schema is edited in the future.
 *
 * @param viewSchema - View schema that `checkout` should be made compatible with.
 * @param allowedSchemaModifications - Flags enum describing the ways this is allowed to modify `checkout`.
 * @param checkout - To be modified as needed to be compatible with `viewSchema`.
 * @param treeContent - Content to be used to initialize `checkout`'s the tree if needed and allowed.
 * @returns true iff checkout now is compatible with `viewSchema`.
 */
export function ensureSchema(
	viewSchema: ViewSchema,
	allowedSchemaModifications: AllowedUpdateType,
	checkout: ITreeCheckout,
	treeContent: TreeStoredContent | undefined,
): boolean {
	let possibleModifications = allowedSchemaModifications;
	if (treeContent === undefined) {
		// Clear bit for Initialize if initial tree is not provided.
		// eslint-disable-next-line no-bitwise
		possibleModifications &= ~AllowedUpdateType.Initialize;
	}
	const updatedNeeded = evaluateUpdate(viewSchema, possibleModifications, checkout);
	switch (updatedNeeded) {
		case UpdateType.None: {
			return true;
		}
		case UpdateType.Incompatible: {
			return false;
		}
		case UpdateType.SchemaCompatible: {
			checkout.updateSchema(toStoredSchema(viewSchema.schema));
			return true;
		}
		case UpdateType.Initialize: {
			if (treeContent === undefined) {
				return false;
			}
			// TODO:
			// When this becomes a more proper out of schema adapter, editing should be made lazy.
			// This will improve support for readonly documents, cross version collaboration and attribution.
			initialize(checkout, treeContent);
			return true;
		}
		default: {
			unreachableCase(updatedNeeded);
		}
	}
}

/**
 * Content that can populate a `SharedTree`.
 */
export interface TreeStoredContent {
	readonly schema: TreeStoredSchema;

	/**
	 * Default tree content to initialize the tree with iff the tree is uninitialized
	 * (meaning it does not even have any schema set at all).
	 */
	readonly initialTree: readonly ITreeCursorSynchronous[] | ITreeCursorSynchronous | undefined;
}
