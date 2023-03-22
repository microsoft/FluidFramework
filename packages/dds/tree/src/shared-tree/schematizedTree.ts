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
import { ISharedTreeBranch } from "./sharedTree";

/**
 * Takes in a tree and returns a view of it that conforms to the view schema.
 * The returned view referees to and can edit the provided one: it is not a fork of it.
 * Updates the stored schema in the tree to match the provided one if requested by config and compatible.
 *
 * If the tree is uninitialized (has no nodes or schema at all),
 * it is initialized to the config's initial tree and the provided schema are stored.
 * This is done even if `AllowedUpdateType.None`.
 *
 * TODO:
 * - Implement schema-aware API for return type.
 * - Support adapters for handling out of schema data.
 * - Support lazy schema updates.
 * - Improve discoverability of this by either integrating it into the factory or main SharedTree interfaces as a method.
 * @alpha
 */
export function schematizeBranch(
	tree: ISharedTreeBranch,
	config: SchematizeConfiguration,
): ISharedTreeBranch {
	// Check for empty.
	// This case could be better handled by making a schematized factory (so it runs only in the "create" case),
	// but handling it here works well enough, and can be considered a special case of an out of schema handler.
	// Note that if this becomes a more proper out of schema handler, it should be made lazy.
	{
		if (tree.context.root.length === 0 && schemaDataIsEmpty(tree.storedSchema)) {
			tree.storedSchema.update(config.schema);
			tree.root = config.initialTree;
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
