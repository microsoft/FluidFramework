/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AdaptedViewSchema,
	type TreeNodeStoredSchema,
	type Adapters,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
} from "../../core/index.js";
import { fail } from "../../util/index.js";
import {
	FieldKinds,
	type FullSchemaPolicy,
	type FieldDiscrepancy,
	getAllowedContentDiscrepancies,
	isNeverTree,
	PosetComparisonResult,
	fieldRealizer,
	comparePosetElements,
} from "../../feature-libraries/index.js";
import {
	normalizeFieldSchema,
	type FieldSchema,
	type ImplicitFieldSchema,
} from "../schemaTypes.js";
import { toStoredSchema } from "../toStoredSchema.js";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { SchemaCompatibilityStatus } from "./tree.js";

/**
 * A collection of View information for schema, including policy.
 */
export class ViewSchema {
	/**
	 * Cached conversion of the view schema in the stored schema format.
	 */
	private readonly viewSchemaAsStored: TreeStoredSchema;
	/**
	 * Normalized view schema (implicitly allowed view schema types are converted to their canonical form).
	 */
	public readonly schema: FieldSchema;

	/**
	 * @param viewSchema - Schema for the root field of this view.
	 */
	public constructor(
		public readonly policy: FullSchemaPolicy,
		public readonly adapters: Adapters,
		viewSchema: ImplicitFieldSchema,
	) {
		this.schema = normalizeFieldSchema(viewSchema);
		this.viewSchemaAsStored = toStoredSchema(this.schema);
	}

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
		// TODO: support adapters
		// const adapted = this.adaptRepo(stored);

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

					if (
						discrepancy.view.some(
							(identifier) =>
								!isNeverTree(
									this.policy,
									this.viewSchemaAsStored,
									this.viewSchemaAsStored.nodeSchema.get(identifier),
								),
						)
					) {
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

		for (const discrepancy of getAllowedContentDiscrepancies(
			this.viewSchemaAsStored,
			stored,
		)) {
			if (!canView && !canUpgrade) {
				break;
			}

			switch (discrepancy.mismatch) {
				case "nodeKind": {
					const viewNodeSchema = this.viewSchemaAsStored.nodeSchema.get(
						discrepancy.identifier,
					);
					const storedNodeSchema = stored.nodeSchema.get(discrepancy.identifier);
					// We conservatively do not allow node types to change.
					// The only time this might be valid in the sense that the data canonically converts is converting an object node
					// to a map node over the union of all the object fields' types.
					if (discrepancy.stored === undefined) {
						const viewIsNever =
							viewNodeSchema !== undefined
								? isNeverTree(this.policy, this.viewSchemaAsStored, viewNodeSchema)
								: true;
						if (!viewIsNever) {
							// View schema has added a node type that the stored schema doesn't know about.
							canView = false;
						}
					} else if (discrepancy.view === undefined) {
						const storedIsNever =
							storedNodeSchema !== undefined
								? isNeverTree(this.policy, stored, storedNodeSchema)
								: true;
						if (!storedIsNever) {
							// Stored schema has a node type that the view schema doesn't know about.
							canUpgrade = false;
						}
					} else {
						// Node type exists in both schemas but has changed. We conservatively never allow this.
						const storedIsNever =
							storedNodeSchema !== undefined
								? isNeverTree(this.policy, stored, storedNodeSchema)
								: true;
						const viewIsNever =
							viewNodeSchema !== undefined
								? isNeverTree(this.policy, this.viewSchemaAsStored, viewNodeSchema)
								: true;
						if (!storedIsNever || !viewIsNever) {
							canView = false;
							canUpgrade = false;
						}
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

		return {
			canView,
			canUpgrade,
			isEquivalent: canView && canUpgrade,
		};
	}

	/**
	 * Compute a schema that `original` could be viewed as using adapters as needed.
	 *
	 * TODO: have a way for callers to get invalidated on schema updates.
	 */
	public adaptRepo(stored: TreeStoredSchema): AdaptedViewSchema {
		// Sanity check on adapters:
		// it's probably a bug if they use the never types,
		// since there never is a reason to have a never type as an adapter input,
		// and its impossible for an adapter to be correctly implemented if its output type is never
		// (unless its input is also never).

		for (const adapter of this.adapters?.tree ?? []) {
			if (
				isNeverTree(
					this.policy,
					this.viewSchemaAsStored,
					this.viewSchemaAsStored.nodeSchema.get(adapter.output),
				)
			) {
				fail("tree adapter for stored adapter.output should not be never");
			}
		}

		const adapted = {
			rootFieldSchema: this.adaptField(stored.rootFieldSchema),
			nodeSchema: new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>(),
		};

		for (const [key, schema] of stored.nodeSchema) {
			const adapatedTree = this.adaptTree(schema);
			adapted.nodeSchema.set(key, adapatedTree);
		}

		// TODO: subset these adapters to the ones that were needed/used.
		return new AdaptedViewSchema(this.adapters, adapted);
	}

	/**
	 * Adapt original such that it allows member types which can be adapted to its specified types.
	 */
	private adaptField(original: TreeFieldStoredSchema): TreeFieldStoredSchema {
		if (original.types !== undefined) {
			const types: Set<TreeNodeSchemaIdentifier> = new Set(original.types);
			for (const treeAdapter of this.adapters?.tree ?? []) {
				if (types.has(treeAdapter.input)) {
					types.delete(treeAdapter.input);
					types.add(treeAdapter.output);
				}
			}

			return { kind: original.kind, types };
		}
		return original;
	}

	private adaptTree(original: TreeNodeStoredSchema): TreeNodeStoredSchema {
		// TODO: support adapters like missing field adapters.
		return original;
	}
}
