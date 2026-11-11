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
 */
export type StoredSchemaUpgradeDiscrepancy =
	| (StoredSchemaDiscrepancyLocation &
			(
				| {
						readonly mismatch: "allowedTypes";
						readonly stored: TreeTypeSet;
						readonly proposed: TreeTypeSet;
				  }
				| {
						readonly mismatch: "fieldKind";
						readonly stored: FieldKindIdentifier;
						readonly proposed: FieldKindIdentifier;
				  }
			))
	| {
			readonly mismatch: "valueSchema";
			readonly identifier: TreeNodeSchemaIdentifier;
			readonly stored: ValueSchema | undefined;
			readonly proposed: ValueSchema | undefined;
	  }
	| {
			readonly mismatch: "nodeKind";
			readonly identifier: TreeNodeSchemaIdentifier;
			readonly stored: TreeNodeStoredSchema;
			readonly proposed: TreeNodeStoredSchema;
	  }
	| {
			readonly mismatch: "missingNodeSchema" | "uninhabitableNodeSchema";
			readonly identifier: TreeNodeSchemaIdentifier;
	  };
