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
export interface SchemaDiscrepancyLocation {
	/** The containing node identifier, or undefined for the root field. */
	readonly identifier: TreeNodeSchemaIdentifier | undefined;
	/** The field key, or undefined for the root field or a map's implicit field. */
	readonly fieldKey: FieldKey | undefined;
}

/**
 * A difference between the stored and proposed schemas that prevents the stored schema from being upgraded.
 *
 * @remarks
 * Where an entry compares two definitions, `stored` describes the existing schema and `proposed` describes the candidate upgrade.
 * This comparison concerns stored-schema upgrade rules; whether a view can access the document is checked separately.
 */
export type StoredSchemaUpgradeDiscrepancy =
	| (SchemaDiscrepancyLocation &
			(
				| {
						/**
						 * The proposed field removes at least one node type allowed by the stored field.
						 * Because the failure concerns which node types the field allows, it compares their identifiers rather than their definitions.
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
						 * Because field kinds determine how many children a field permits, changing the kind can exclude previously allowed content.
						 * The policy also restricts some transitions that would otherwise allow clients to upgrade repeatedly back and forth.
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
			 * For example, reusing the same node identifier for number values would stop accepting its previously allowed string values.
			 * In contrast, changing a field between distinct number and string node identifiers changes which nodes the field allows,
			 * so that change produces `allowedTypes` instead.
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
			 * Stored nodes use an object, map, or leaf representation, with arrays using the object representation.
			 * Changing that representation must preserve previously allowed structures:
			 * a map-to-object change fails this requirement, though some object-to-map upgrades are permitted.
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
			 * Because the comparison uses those existing definitions, this failure does not necessarily mean
			 * the node cannot be constructed using the complete proposed schema.
			 */
			readonly mismatch: "nodeSchemaCannotBeSatisfied";
			/**
			 * The node schema identifier whose proposed definition has an unsatisfied requirement.
			 */
			readonly identifier: TreeNodeSchemaIdentifier;
			/**
			 * An immediate requirement that prevents construction, not a complete chain of child-type failures.
			 */
			readonly requirement:
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
						 * All child types allowed by the proposed field, none of which can satisfy its requirement for a child.
						 * Either the set is empty or every type in it cannot be constructed using existing stored definitions.
						 */
						readonly allowedTypes: TreeTypeSet;
				  };
	  };
