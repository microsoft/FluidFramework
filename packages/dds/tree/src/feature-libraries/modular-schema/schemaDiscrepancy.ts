/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FieldKey,
	FieldKindIdentifier,
	TreeNodeSchemaIdentifier,
	TreeNodeStoredSchema,
	TreeTypeSet,
	ValueSchema,
} from "../../core/index.js";

/**
 * The location of a field discrepancy, using stored schema identifiers and keys.
 */
export interface StoredSchemaDiscrepancyLocation {
	/** The containing node identifier, or undefined for the root field. */
	readonly identifier: TreeNodeSchemaIdentifier | undefined;
	/** The field key, or undefined for the root field or a map's implicit field. */
	readonly fieldKey: FieldKey | undefined;
}

/**
 * A failed stored-schema upgrade constraint, before formatting for an application.
 *
 * @remarks
 * `stored` describes the existing schema, and `proposed` describes the candidate upgrade.
 * These entries explain upgrade restrictions, not whether a view can access the document.
 */
export type StoredSchemaUpgradeDiscrepancy = {
	/**
	 * Identifies an upgrade comparison rather than a viewing comparison.
	 */
	readonly operation: "upgrade";
} & (
	| (StoredSchemaDiscrepancyLocation &
			(
				| {
						/**
						 * The proposed field removes at least one node type allowed by the stored field.
						 * This compares node type identifiers, not the definitions of those nodes.
						 */
						readonly mismatch: "allowedTypes";
						/**
						 * All node types allowed by the stored field, including types also allowed by the proposal.
						 */
						readonly stored: TreeTypeSet;
						/**
						 * All node types allowed by the proposed field.
						 */
						readonly proposed: TreeTypeSet;
				  }
				| {
						/**
						 * The transition between field kinds is not permitted by the comparison policy.
						 * Field kinds specify how many children a field permits, such as exactly one or zero or one.
						 * Upgrade rules also restrict some transitions to prevent repeated upgrades back and forth.
						 */
						readonly mismatch: "fieldKind";
						/**
						 * The stored field kind.
						 */
						readonly stored: FieldKindIdentifier;
						/**
						 * The proposed field kind.
						 */
						readonly proposed: FieldKindIdentifier;
				  }
			))
	| {
			/**
			 * The proposed leaf value type does not accept all values allowed by the stored leaf.
			 * For example, the same node identifier changes from string values to number values.
			 * Changing a field between distinct number and string node identifiers instead produces `allowedTypes`.
			 */
			readonly mismatch: "valueSchema";
			/**
			 * The leaf node schema identifier shared by both definitions.
			 */
			readonly identifier: TreeNodeSchemaIdentifier;
			/**
			 * The stored primitive value or Fluid handle type, or undefined when unconstrained.
			 */
			readonly stored: ValueSchema | undefined;
			/**
			 * The proposed primitive value or Fluid handle type, or undefined when unconstrained.
			 */
			readonly proposed: ValueSchema | undefined;
	  }
	| {
			/**
			 * The proposed node representation is incompatible with the stored representation.
			 * Representations are object, map, or leaf; arrays use the object representation.
			 * For example, changing a map to an object is not permitted, though some object-to-map upgrades are.
			 */
			readonly mismatch: "nodeKind";
			/**
			 * The node schema identifier shared by both definitions.
			 */
			readonly identifier: TreeNodeSchemaIdentifier;
			/**
			 * The complete stored node definition.
			 */
			readonly stored: TreeNodeStoredSchema;
			/**
			 * The complete proposed node definition.
			 */
			readonly proposed: TreeNodeStoredSchema;
	  }
	| {
			/**
			 * A stored node definition that permits constructible nodes is absent from the proposal.
			 * Removing it would stop accepting nodes allowed by the stored schema.
			 */
			readonly mismatch: "missingNodeSchema";
			/**
			 * The stored node schema identifier missing from the proposal.
			 */
			readonly identifier: TreeNodeSchemaIdentifier;
	  }
	| {
			/**
			 * The proposed node cannot be constructed when child types are resolved using existing stored definitions.
			 * This does not necessarily mean it cannot be constructed using the complete proposed schema.
			 */
			readonly mismatch: "nodeSchemaCannotBeSatisfied";
			/**
			 * The node schema identifier whose proposed definition has an unsatisfied requirement.
			 */
			readonly identifier: TreeNodeSchemaIdentifier;
			/**
			 * An immediate requirement that prevents construction, not a complete chain of child-type failures.
			 */
			readonly constraint:
				| {
						/**
						 * The map requires a child for every possible key, which a finite tree cannot provide.
						 */
						readonly kind: "requiredMapEntries";
				  }
				| {
						/**
						 * A required object field has no constructible allowed child type in the existing stored schema.
						 */
						readonly kind: "requiredField";
						/**
						 * The stored key of the required field in the proposed node.
						 */
						readonly fieldKey: FieldKey;
						/**
						 * All child types allowed by the proposed field.
						 * The set is empty, or none of its types can be constructed using existing stored definitions.
						 */
						readonly allowedTypes: TreeTypeSet;
				  };
	  }
);
