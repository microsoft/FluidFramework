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
	rootFieldKey,
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
	normalizeNewFieldContent,
} from "../feature-libraries/index.js";
import { fail } from "../util/index.js";
import { ITreeCheckout } from "./treeCheckout.js";

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

	if (
		compatibility.read === Compatibility.Compatible &&
		compatibility.write === Compatibility.Compatible
	) {
		// Compatible as is
		return UpdateType.None;
	}

	// eslint-disable-next-line no-bitwise
	if (allowedSchemaModifications & AllowedUpdateType.Initialize && canInitialize(checkout)) {
		return UpdateType.Initialize;
	}

	if (compatibility.read !== Compatibility.Compatible) {
		// Existing stored schema permits trees which are incompatible with the view schema, so schema can not be updated
		return UpdateType.Incompatible;
	}

	assert(compatibility.write === Compatibility.Incompatible, "unexpected case");
	assert(compatibility.read === Compatibility.Compatible, "unexpected case");

	// eslint-disable-next-line no-bitwise
	return allowedSchemaModifications & AllowedUpdateType.SchemaCompatible
		? UpdateType.SchemaCompatible
		: UpdateType.Incompatible;
}

export function canInitialize(checkout: ITreeCheckout): boolean {
	// Check for empty.
	return checkout.forest.isEmpty && schemaDataIsEmpty(checkout.storedSchema);
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
	treeContent: TreeContent | undefined,
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
			checkout.updateSchema(intoStoredSchema(viewSchema.schema));
			return true;
		}
		case UpdateType.Initialize: {
			if (treeContent === undefined) {
				return false;
			}
			// TODO:
			// When this becomes a more proper out of schema adapter, editing should be made lazy.
			// This will improve support for readonly documents, cross version collaboration and attribution.

			checkout.transaction.start();
			initializeContent(checkout, treeContent.schema, () => {
				const field = { field: rootFieldKey, parent: undefined };
				const content = normalizeNewFieldContent(
					{ schema: treeContent.schema },
					treeContent.schema.rootFieldSchema,
					treeContent.initialTree,
				);
				switch (checkout.storedSchema.rootFieldSchema.kind.identifier) {
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
			checkout.transaction.commit();

			return true;
		}
		default: {
			unreachableCase(updatedNeeded);
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
