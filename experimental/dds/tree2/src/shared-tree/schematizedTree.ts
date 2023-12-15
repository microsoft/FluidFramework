/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	AllowedUpdateType,
	Compatibility,
	TreeStoredSchema,
	StoredSchemaRepository,
	ITreeCursorSynchronous,
	schemaDataIsEmpty,
} from "../core";
import {
	defaultSchemaPolicy,
	FieldKinds,
	allowsRepoSuperset,
	FlexTreeSchema,
	TreeFieldSchema,
	ViewSchema,
	InsertableFlexField,
	intoStoredSchema,
} from "../feature-libraries";
import { fail } from "../util";
import { ISubscribable } from "../events";
import { CheckoutEvents } from "./treeCheckout";

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
	storedSchema: StoredSchemaRepository,
	newSchema: FlexTreeSchema,
	setInitialTree: () => void,
): void {
	assert(schemaDataIsEmpty(storedSchema), 0x743 /* cannot initialize after a schema is set */);

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
	storedSchema.update(incrementalSchemaUpdate);
	// Insert initial tree
	setInitialTree();

	// If intermediate schema is not final desired schema, update to the final schema:
	if (incrementalSchemaUpdate !== schema) {
		storedSchema.update(schema);
	}
}

/**
 * See {@link ISharedTree.schematize} for more details.
 *
 * TODO:
 * - Support adapters for handling out of schema data.
 * - Handle initialization via an adapter.
 * - Support per adapter update policy.
 * - Support lazy schema updates.
 * - Better error for change to invalid schema approach than throwing on later event.
 */
export function schematize(
	events: ISubscribable<CheckoutEvents>,
	storedSchema: StoredSchemaRepository,
	config: SchematizeConfiguration,
): void {
	// TODO: support adapters and include them here.
	const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, config.schema);
	{
		const compatibility = viewSchema.checkCompatibility(storedSchema);
		switch (config.allowedSchemaModifications) {
			case AllowedUpdateType.None: {
				if (compatibility.read !== Compatibility.Compatible) {
					fail(
						"Existing stored schema permits trees which are incompatible with the view schema",
					);
				}

				if (compatibility.write !== Compatibility.Compatible) {
					// TODO: support readonly mode in this case.
					fail("View schema permits trees which are incompatible with the stored schema");
				}

				break;
			}
			case AllowedUpdateType.SchemaCompatible: {
				if (compatibility.read !== Compatibility.Compatible) {
					fail(
						"Existing stored schema permits trees which are incompatible with the view schema, so schema can not be updated",
					);
				}
				if (compatibility.write !== Compatibility.Compatible) {
					storedSchema.update(intoStoredSchema(config.schema));
				}

				break;
			}
			default: {
				unreachableCase(config.allowedSchemaModifications);
			}
		}
	}
	afterSchemaChanges(events, storedSchema, () => {
		const compatibility = viewSchema.checkCompatibility(storedSchema);
		if (compatibility.read !== Compatibility.Compatible) {
			fail(
				"Stored schema changed to one that permits data incompatible with the view schema",
			);
		}

		if (compatibility.write !== Compatibility.Compatible) {
			// TODO: support readonly mode in this case.
			fail(
				"Stored schema changed to one that does not support all data allowed by view schema",
			);
		}
		return true;
	});
}

/**
 * @param callback - run after a schema change. If returns true, will run after next change as well.
 */
export function afterSchemaChanges(
	events: ISubscribable<CheckoutEvents>,
	storedSchema: StoredSchemaRepository,
	callback: () => boolean,
): void {
	// Callback to cleanup afterBatch schema checking.
	// Set only when such a callback is pending.
	let afterBatchCheck: undefined | (() => void);

	// TODO: errors thrown by this will usually be in response to remote edits, and thus may not surface to the app.
	// Two fixes should be done related to this:
	// 1. Ensure errors in response to edits like this crash app and report telemetry.
	// 2. Replace these (and the above) exception based errors with
	// out of schema handlers which update the schematized view of the tree instead of throwing.
	const unregister = storedSchema.on("afterSchemaChange", () => {
		// On schema change, setup a callback (deduplicated so its only run once) after a batch of changes.
		// This avoids erroring about invalid schema in the middle of a batch of changes.
		// TODO:
		// Ideally this would run at the end of the batch containing the schema change, but currently schema changes don't trigger afterBatch.
		// Fortunately this works out ok, since the tree can't actually become out of schema until its actually edited, which should trigger after batch.
		// When batching properly handles schema edits, this documentation and related tests should be updated.
		// TODO:
		// With the the updated incremental batch application policy, this behavior is not valid.
		afterBatchCheck ??= events.on("afterBatch", () => {
			assert(afterBatchCheck !== undefined, 0x728 /* unregistered event ran */);
			afterBatchCheck();
			afterBatchCheck = undefined;

			if (!callback()) {
				unregister();
			}
		});
	});
}

/**
 * View Schema for a `SharedTree`.
 *
 * @alpha
 */
export interface SchemaConfiguration<TRoot extends TreeFieldSchema = TreeFieldSchema> {
	/**
	 * The schema which the application wants to view the tree with.
	 */
	readonly schema: FlexTreeSchema<TRoot>;
}

/**
 * Content that can populate a `SharedTree`.
 *
 * @alpha
 */
export interface TreeContent<TRoot extends TreeFieldSchema = TreeFieldSchema>
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
 * @alpha
 */
export interface SchematizeConfiguration<TRoot extends TreeFieldSchema = TreeFieldSchema>
	extends SchemaConfiguration<TRoot> {
	/**
	 * Controls if and how schema from existing documents can be updated to accommodate the view schema.
	 */
	readonly allowedSchemaModifications: AllowedUpdateType;
}

/**
 * Options used to initialize (if needed) and schematize a `SharedTree`.
 *
 * @alpha
 */
export interface InitializeAndSchematizeConfiguration<
	TRoot extends TreeFieldSchema = TreeFieldSchema,
> extends TreeContent<TRoot>,
		SchematizeConfiguration<TRoot> {}

/**
 * Options used to initialize (if needed) and schematize a `SharedTree`.
 * @remarks
 * Using this builder improves type safety and error quality over just constructing the configuration as a object.
 * @alpha
 */
export function buildTreeConfiguration<T extends TreeFieldSchema>(
	config: InitializeAndSchematizeConfiguration<T>,
): InitializeAndSchematizeConfiguration<T> {
	return config;
}
