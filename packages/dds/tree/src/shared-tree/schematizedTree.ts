/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import {
	schemaDataIsEmpty,
	AllowedUpdateType,
	Compatibility,
	SimpleObservingDependent,
} from "../core";
import {
	ViewSchema,
	defaultSchemaPolicy,
	ViewSchemaCollection,
	ContextuallyTypedFieldData,
} from "../feature-libraries";
import { fail } from "../util";
import { ISharedTreeView } from "./sharedTree";

/**
 * Takes in a tree and returns a view of it that conforms to the view schema.
 * The returned view referees to and can edit the provided one: it is not a fork of it.
 * Updates the stored schema in the tree to match the provided one if requested by config and compatible.
 *
 * If the tree is uninitialized (has no nodes or schema at all),
 * it is initialized to the config's initial tree and the provided schema are stored.
 * This is done even if `AllowedUpdateType.None`.
 *
 * @remarks
 * Doing initialization here, regardless of `AllowedUpdateType`, allows a small API that is hard to use incorrectly.
 * Other approach tend to have leave easy to make mistakes.
 * For example, having a separate initialization function means apps can forget to call it, making an app that can only open existing document,
 * or call it unconditionally leaving an app that can only create new documents.
 * It also would require the schema to be passed into to separate places and could cause issues if they didn't match.
 * Since the initialization function couldn't return a typed tree, the type checking wouldn't help catch that.
 * Also, if an app manages to create a document, but the initialization fails to get persisted, an app that only calls the initialization function
 * on the create code-path (for example how a schematized factory might do it),
 * would leave the document in an unusable state which could not be repaired when it is reopened (by the same or other clients).
 * Additionally, once out of schema content adapters are properly supported (with lazy document updates),
 * this initialization could become just another out of schema content adapter: at tha point it clearly belong here in schematize.
 *
 * TODO:
 * - Implement schema-aware API for return type.
 * - Support adapters for handling out of schema data.
 * - Handle initialization via an adapter.
 * - Support per adapter update policy.
 * - Support lazy schema updates.
 * - Improve discoverability of this by either integrating it into the factory or main SharedTree interfaces as a method.
 * @alpha
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
			// TODO: This schema update can cause the document to be out of schema until the initialTree is applied on the next line.
			// This is technically invalid and should be done some other way.
			// An better approach would be to:
			// 1. Set the schema to an adjusted version of `config.schema` which permits an empty tree (force the root to be optional or sequence),
			// 2. Set the contents of the tree.
			// 3. Set the schema to the desired final schema.
			tree.storedSchema.update(config.schema);
			tree.root = config.initialTree;
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
 * Options used to schematize a `SharedTree`
 * @alpha
 */
export interface SchematizeConfiguration {
	readonly schema: ViewSchemaCollection;
	readonly allowedSchemaModifications: AllowedUpdateType;
	readonly initialTree: ContextuallyTypedFieldData;
}
