/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type FieldKey,
	type FieldKindIdentifier,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
	type TreeTypeSet,
	type ValueSchema,
} from "../../core/index.js";

interface AllowedTypeIncompatibility {
	identifier: string | undefined; // undefined indicates root field schema
	mismatch: "allowedTypes";
	/**
	 * List of allowed type identifiers in viewed schema
	 */
	view: string[];
	/**
	 * List of allowed type identifiers in stored schema
	 */
	stored: string[];
}

interface FieldKindIncompatibility {
	identifier: string | undefined; // undefined indicates root field schema
	mismatch: "fieldKind";
	view: FieldKindIdentifier | undefined;
	stored: FieldKindIdentifier | undefined;
}

interface ValueSchemaIncompatibility {
	identifier: string;
	mismatch: "valueSchema";
	view: ValueSchema | undefined;
	stored: ValueSchema | undefined;
}

type FieldIncompatibility =
	| AllowedTypeIncompatibility
	| FieldKindIncompatibility
	| ValueSchemaIncompatibility;

type SchemaFactoryNodeKind = "object" | "leaf" | "map";

interface NodeKindIncompatibility {
	identifier: string;
	mismatch: "nodeKind";
	view: SchemaFactoryNodeKind | undefined;
	stored: SchemaFactoryNodeKind | undefined;
}

interface NodeFieldsIncompatibility {
	identifier: string;
	mismatch: "fields";
	differences: FieldIncompatibility[];
}

type NodeIncompatibility = NodeKindIncompatibility | NodeFieldsIncompatibility;

type Incompatibility = FieldIncompatibility | NodeIncompatibility;

/**
 * @returns the discrepancies between two TreeStoredSchema objects
 */
export function getAllowedContentIncompatibilities(
	view: TreeStoredSchema,
	stored: TreeStoredSchema,
): Incompatibility[] {
	const incompatibilities: Incompatibility[] = [];

	// check root schema discrepancies
	incompatibilities.push(
		...trackFieldDiscrepancies(view.rootFieldSchema, stored.rootFieldSchema),
	);

	const nodeKeySet = new Set<TreeNodeSchemaIdentifier>();
	for (const [key, viewNodeSchema] of view.nodeSchema) {
		nodeKeySet.add(key);

		if (viewNodeSchema instanceof ObjectNodeStoredSchema) {
			if (!stored.nodeSchema.has(key)) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "object",
					stored: undefined,
				});
			}
			const storedNodeSchema = stored.nodeSchema.get(key);
			if (storedNodeSchema instanceof MapNodeStoredSchema) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "object",
					stored: "map",
				} satisfies NodeKindIncompatibility);
			} else if (storedNodeSchema instanceof LeafNodeStoredSchema) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "object",
					stored: "leaf",
				} satisfies NodeKindIncompatibility);
			} else if (storedNodeSchema instanceof ObjectNodeStoredSchema) {
				const differences = trackObjectNodeDiscrepancies(viewNodeSchema, storedNodeSchema);
				if (differences.length > 0) {
					incompatibilities.push({
						identifier: key,
						mismatch: "fields",
						differences,
					} satisfies NodeFieldsIncompatibility);
				}
			}
		} else if (viewNodeSchema instanceof MapNodeStoredSchema) {
			if (!stored.nodeSchema.has(key)) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "map",
					stored: undefined,
				} satisfies NodeKindIncompatibility);
			}
			const storedNodeSchema = stored.nodeSchema.get(key);
			if (storedNodeSchema instanceof ObjectNodeStoredSchema) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "map",
					stored: "object",
				} satisfies NodeKindIncompatibility);
			} else if (storedNodeSchema instanceof LeafNodeStoredSchema) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "map",
					stored: "leaf",
				} satisfies NodeKindIncompatibility);
			} else if (storedNodeSchema instanceof MapNodeStoredSchema) {
				incompatibilities.push(
					...trackFieldDiscrepancies(
						viewNodeSchema.mapFields,
						storedNodeSchema.mapFields,
						key,
					),
				);
			}
		} else if (viewNodeSchema instanceof LeafNodeStoredSchema) {
			if (!stored.nodeSchema.has(key)) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "leaf",
					stored: undefined,
				});
			}
			const storedNodeSchema = stored.nodeSchema.get(key);
			if (storedNodeSchema instanceof MapNodeStoredSchema) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "leaf",
					stored: "map",
				} satisfies NodeKindIncompatibility);
			} else if (storedNodeSchema instanceof ObjectNodeStoredSchema) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "leaf",
					stored: "object",
				} satisfies NodeKindIncompatibility);
			} else if (storedNodeSchema instanceof LeafNodeStoredSchema) {
				if (viewNodeSchema.leafValue !== storedNodeSchema.leafValue) {
					incompatibilities.push({
						identifier: key,
						mismatch: "valueSchema",
						view: viewNodeSchema.leafValue,
						stored: storedNodeSchema.leafValue,
					} satisfies ValueSchemaIncompatibility);
				}
			}
		}
	}

	for (const [key, storedNodeSchema] of stored.nodeSchema) {
		if (!nodeKeySet.has(key)) {
			incompatibilities.push({
				identifier: key,
				mismatch: "nodeKind",
				view: undefined,
				stored:
					storedNodeSchema instanceof MapNodeStoredSchema
						? "map"
						: storedNodeSchema instanceof ObjectNodeStoredSchema
							? "object"
							: "leaf",
			} satisfies NodeKindIncompatibility);
		}
	}

	return incompatibilities;
}

function trackFieldDiscrepancies(
	view: TreeFieldStoredSchema,
	stored: TreeFieldStoredSchema,
	keyOrRoot?: string,
): FieldIncompatibility[] {
	const differences: FieldIncompatibility[] = [];

	const findSetDiscrepancies = (
		a: TreeTypeSet,
		b: TreeTypeSet,
	): [TreeNodeSchemaIdentifier[], TreeNodeSchemaIdentifier[]] => {
		if (a === undefined && b === undefined) {
			return [[], []];
		}

		if (a !== undefined && b !== undefined) {
			const aDiff = [...a].filter((value) => !b.has(value));
			const bDiff = [...b].filter((value) => !a.has(value));
			return [aDiff, bDiff];
		}

		if (a !== undefined) {
			return [[...a], []];
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return [[], [...b!]];
	};

	const allowedTypesDiscrepancies = findSetDiscrepancies(view.types, stored.types);
	if (allowedTypesDiscrepancies[0].length > 0 || allowedTypesDiscrepancies[1].length > 0) {
		differences.push({
			identifier: keyOrRoot,
			mismatch: "allowedTypes",
			view: allowedTypesDiscrepancies[0],
			stored: allowedTypesDiscrepancies[1],
		} satisfies AllowedTypeIncompatibility);
	}

	if (view.kind !== stored.kind) {
		differences.push({
			identifier: keyOrRoot,
			mismatch: "fieldKind",
			view: view.kind,
			stored: stored.kind,
		} satisfies FieldKindIncompatibility);
	}

	return differences;
}

function trackObjectNodeDiscrepancies(
	view: ObjectNodeStoredSchema,
	stored: ObjectNodeStoredSchema,
): FieldIncompatibility[] {
	const differences: FieldIncompatibility[] = [];
	const fieldKeySet = new Set<FieldKey>();
	/**
	 * We will track three types of differences:
	 * 1. Fields that exist in the original schema but not in the updated schema.
	 * 2. Fields that exist in both schemas but have different contents.
	 * 3. Fields that exist in the updated schema but not in the original schema.
	 *
	 * First, the original schema is iterated to track the first two types of differences.
	 * Then, the updated schema is iterated to find the third type.
	 */

	for (const [fieldKey, fieldStoredSchema] of view.objectNodeFields) {
		fieldKeySet.add(fieldKey);
		if (!stored.objectNodeFields.has(fieldKey)) {
			differences.push({
				identifier: fieldKey,
				mismatch: "fieldKind",
				view: fieldStoredSchema.kind,
				stored: undefined,
			} satisfies FieldKindIncompatibility);
		} else {
			differences.push(
				...trackFieldDiscrepancies(
					view.objectNodeFields.get(fieldKey) as TreeFieldStoredSchema,
					stored.objectNodeFields.get(fieldKey) as TreeFieldStoredSchema,
					fieldKey,
				),
			);
		}
	}

	for (const [fieldKey, fieldStoredSchema] of stored.objectNodeFields) {
		if (fieldKeySet.has(fieldKey)) {
			continue;
		}
		differences.push({
			identifier: fieldKey,
			mismatch: "fieldKind",
			view: undefined,
			stored: fieldStoredSchema.kind,
		} satisfies FieldKindIncompatibility);
	}

	return differences;
}
