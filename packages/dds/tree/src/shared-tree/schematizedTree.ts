/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	schemaDataIsEmpty,
	AllowedUpdateType,
	Compatibility,
	SimpleObservingDependent,
	rootFieldKeySymbol,
	lookupGlobalFieldSchema,
	rootFieldKey,
	SchemaData,
} from "../core";
import {
	ViewSchema,
	defaultSchemaPolicy,
	ContextuallyTypedFieldData,
	cursorsFromContextualData,
	FieldKinds,
	allowsRepoSuperset,
	ViewSchemaCollection,
} from "../feature-libraries";
import { fail } from "../util";
import { ISharedTreeView } from "./sharedTree";

/**
 * See {@link ISharedTreeView.schematize} for more details.
 *
 * TODO:
 * - Support adapters for handling out of schema data.
 * - Handle initialization via an adapter.
 * - Support per adapter update policy.
 * - Support lazy schema updates.
 */
export function schematizeView(
	tree: ISharedTreeView,
	config: SchematizeConfiguration,
): ISharedTreeView {
	// Check for empty.
	// When this becomes a more proper out of schema adapter, it should be made lazy.
	{
		if (tree.context.root.length === 0 && schemaDataIsEmpty(tree.storedSchema)) {
			tree.transaction.start();

			const rootKind = lookupGlobalFieldSchema(config.schema, rootFieldKey).kind.identifier;

			// To keep the data in schema during the update, first define a schema that tolerates the current (empty) tree as well as the final (initial) tree.
			let incrementalSchemaUpdate: SchemaData;
			if (
				rootKind === FieldKinds.sequence.identifier ||
				rootKind === FieldKinds.optional.identifier
			) {
				// These kinds are known to tolerate empty, so use the schema as is:
				incrementalSchemaUpdate = config.schema;
			} else {
				assert(rootKind === FieldKinds.value.identifier, "Unexpected kind");
				incrementalSchemaUpdate = {
					...config.schema,
					globalFieldSchema: new Map(config.schema.globalFieldSchema),
				};
			}

			// TODO: fix issues with schema comparison and enable this.
			// assert(
			// 	allowsRepoSuperset(defaultSchemaPolicy, tree.storedSchema, incrementalSchemaUpdate),
			// 	"Incremental Schema update should support the existing empty tree",
			// );
			assert(
				allowsRepoSuperset(defaultSchemaPolicy, incrementalSchemaUpdate, config.schema),
				"Incremental Schema during update should be a allow a superset of the final schema",
			);
			// Update to intermediate schema
			tree.storedSchema.update(incrementalSchemaUpdate);
			// Insert initial tree
			const newContent = cursorsFromContextualData(
				config.schema,
				lookupGlobalFieldSchema(config.schema, rootFieldKey),
				config.initialTree,
			);
			tree.editor.sequenceField(undefined, rootFieldKeySymbol).insert(0, newContent);

			// If intermediate schema is not final desired schema, update to the final schema:
			if (incrementalSchemaUpdate !== config.schema) {
				tree.storedSchema.update(config.schema);
			}

			tree.transaction.commit();
		}
	}

	// TODO: support adapters and include them here.
	const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, config.schema);
	{
		const compatibility = viewSchema.checkCompatibility(tree.storedSchema);
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
					tree.storedSchema.update(config.schema);
				}

				break;
			}
			default: {
				unreachableCase(config.allowedSchemaModifications);
			}
		}
	}

	// TODO: errors thrown by this will usually be in response to remote edits, and thus may not surface to the app.
	// Two fixes should be done related to this:
	// 1. Ensure errors in response to edits like this crash app and report telemetry.
	// 2. Replace these (and the above) exception based errors with
	// out of schema handlers which update the schematized view of the tree instead of throwing.
	tree.storedSchema.registerDependent(
		new SimpleObservingDependent(() => {
			const compatibility = viewSchema.checkCompatibility(tree.storedSchema);
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
		}),
	);

	return tree;
}

/**
 * Options used to schematize a `SharedTree`.
 * See {@link ISharedTreeView.schematize}.
 *
 * @alpha
 */
export interface SchematizeConfiguration<TMap extends ViewSchemaCollection = ViewSchemaCollection> {
	/**
	 * The schema which the application wants to view the tree with.
	 */
	readonly schema: TMap;
	/**
	 * Controls if and how schema from existing documents can be updated to accommodate the view schema.
	 */
	readonly allowedSchemaModifications: AllowedUpdateType;
	/**
	 * Default tree content to initialize the tree with iff the tree is uninitialized
	 * (meaning it does not even have any schema set at all).
	 */
	readonly initialTree: ContextuallyTypedFieldData;
}
