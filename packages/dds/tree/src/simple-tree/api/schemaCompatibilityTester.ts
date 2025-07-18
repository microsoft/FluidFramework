/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import type { TreeStoredSchema } from "../../core/index.js";
import {
	allowsRepoSuperset,
	FieldKinds,
	type FullSchemaPolicy,
	isNeverTree,
} from "../../feature-libraries/index.js";
import type { FieldSchema } from "../fieldSchema.js";

import type { SchemaCompatibilityStatus } from "./tree.js";
import {
	comparePosetElements,
	fieldRealizer,
	getAllowedContentDiscrepancies,
	PosetComparisonResult,
	type FieldDiscrepancy,
} from "../discrepancies.js";
import { toStoredSchema } from "../toStoredSchema.js";

/**
 * A collection of View information for schema, including policy.
 * @remarks
 * This contains everything needed to determine compatibility with a given stored schema.
 */
export class SchemaCompatibilityTester {
	/**
	 * @param viewSchemaRoot - Schema for the root field.
	 */
	public constructor(
		public readonly policy: FullSchemaPolicy,
		public readonly viewSchemaRoot: FieldSchema,
	) {}

	/**
	 * Determines the compatibility of a stored document
	 * (based on its stored schema) with a viewer (based on its view schema).
	 *
	 * Adapters can be provided to handle differences between the two schema.
	 * Adapters should only use to types in the `view` SchemaRepository.
	 *
	 * TODO: this API violates the parse don't validate design philosophy.
	 * It should be wrapped with (or replaced by) a parse style API.
	 */
	public checkCompatibility(
		stored: TreeStoredSchema,
	): Omit<SchemaCompatibilityStatus, "canInitialize"> {
		// View schema allows a subset of documents that stored schema does, and the discrepancies are allowed by policy
		// determined by the view schema (i.e. objects with extra optional fields in the stored schema have opted into allowing this.
		// In the future, this would also include things like:
		// - fields with more allowed types in the stored schema than in the view schema have out-of-schema "unknown content" adapters
		let canView = true;
		// View schema allows a superset of documents that stored schema does, hence the document could be upgraded to use a persisted version
		// of this view schema as its stored schema.
		let canUpgrade = true;

		const updateCompatibilityFromFieldDiscrepancy = (discrepancy: FieldDiscrepancy): void => {
			switch (discrepancy.mismatch) {
				case "allowedTypes": {
					// Since we only track the symmetric difference between the allowed types in the view and
					// stored schemas, it's sufficient to check if any extra allowed types still exist in the
					// stored schema.
					if (
						discrepancy.stored.some(
							(identifier) =>
								!isNeverTree(this.policy, stored, stored.nodeSchema.get(identifier)),
						)
					) {
						// Stored schema has extra allowed types that the view schema does not.
						canUpgrade = false;
						canView = false;
					}

					if (discrepancy.view.length > 0) {
						// View schema has extra allowed types that the stored schema does not.
						canView = false;
					}
					break;
				}
				case "fieldKind": {
					const result = comparePosetElements(
						discrepancy.stored,
						discrepancy.view,
						fieldRealizer,
					);

					if (result === PosetComparisonResult.Greater) {
						// Stored schema is more relaxed than view schema.
						canUpgrade = false;
						if (
							discrepancy.view === FieldKinds.forbidden.identifier &&
							discrepancy.identifier !== undefined &&
							this.policy.allowUnknownOptionalFields(discrepancy.identifier)
						) {
							// When the application has opted into it, we allow viewing documents which have additional
							// optional fields in the stored schema that are not present in the view schema.
						} else {
							canView = false;
						}
					}

					if (result === PosetComparisonResult.Less) {
						// View schema is more relaxed than stored schema.
						canView = false;
					}

					if (result === PosetComparisonResult.Incomparable) {
						canUpgrade = false;
						canView = false;
					}

					break;
				}
				case "valueSchema": {
					canView = false;
					canUpgrade = false;
					break;
				}
				default:
					unreachableCase(discrepancy);
			}
		};

		for (const discrepancy of getAllowedContentDiscrepancies(this.viewSchemaRoot, stored)) {
			if (!canView && !canUpgrade) {
				break;
			}

			switch (discrepancy.mismatch) {
				case "nodeKind": {
					const storedNodeSchema = stored.nodeSchema.get(discrepancy.identifier);
					// We conservatively do not allow node types to change.
					// The only time this might be valid in the sense that the data canonically converts is converting an object node
					// to a map node over the union of all the object fields' types.
					if (discrepancy.stored === undefined) {
						// View schema has added a node type that the stored schema doesn't know about.
						// Note that all cases which trigger this should also trigger an AllowedTypeDiscrepancy (where the type is used).
						// This means this case should be redundant and could be removed in the future if there is a reason to do so
						// (like simplifying enablable type support).
						// See the TODO in getAllowedContentDiscrepancies.
						canView = false;
					} else if (discrepancy.view === undefined) {
						const storedIsNever =
							storedNodeSchema !== undefined
								? isNeverTree(this.policy, stored, storedNodeSchema)
								: true;
						if (!storedIsNever) {
							// Stored schema has a node type that the view schema doesn't know about.
							// The design of allowUnknownOptionalFields allows adding new optional content to types,
							// and the new optional content can use new types.
							// Therefore this case needs to be supported for viewing.
							// However, it is not supported for upgrade as the stored document must be newer (or at least more general) than the view in this case.
							// The fact that there might be removed trees with a root of this type which only appears in the stored schema is why this must set canUpgrade to false.
							canUpgrade = false;
						}
					} else {
						// Node type exists in both schemas but kind has changed. We conservatively never allow this.
						// See note above about cases where this could be allowed if needed.
						canView = false;
						canUpgrade = false;
					}
					break;
				}
				case "valueSchema":
				case "allowedTypes":
				case "fieldKind": {
					updateCompatibilityFromFieldDiscrepancy(discrepancy);
					break;
				}
				case "fields": {
					discrepancy.differences.forEach(updateCompatibilityFromFieldDiscrepancy);
					break;
				}
				// No default
			}
		}

		if (canUpgrade) {
			assert(
				allowsRepoSuperset(this.policy, stored, toStoredSchema(this.viewSchemaRoot)),
				"View schema must be a superset of the stored schema to allow upgrade",
			);
		}

		return {
			canView,
			canUpgrade,
			isEquivalent: canView && canUpgrade,
		};
	}
}
