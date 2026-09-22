/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	storedEmptyFieldSchema,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	ValueSchema,
} from "../../core/index.js";
import {
	defaultSchemaPolicy,
	FieldKinds,
	getStoredSchemaSupersetFailures,
} from "../../feature-libraries/index.js";
import { brand, type JsonCompatibleReadOnly } from "../../util/index.js";
import { NodeKind, StagedSchemaUpgradePolicy } from "../core/index.js";
import type { SimpleFieldSchema } from "../simpleSchema.js";
import { toUpgradeSchema } from "../toStoredSchema.js";
import type { TreeSchema } from "../treeSchema.js";

import type { Discrepancy } from "./discrepancies.js";
import type { SchemaCompatibilityStatusBeta } from "./tree.js";

/**
 * Identifies a schema element using persisted identifiers and field keys.
 *
 * @remarks
 * The root field uses `"root"`. A node location omits `fieldKey`.
 * An implicit map, record, or array field uses `fieldKey: null`.
 *
 * @alpha
 */
export type SchemaDiscrepancyLocationAlpha =
	| "root"
	| {
			/**
			 * Persisted identifier of the node schema containing the difference.
			 */
			readonly nodeType: string;
			/**
			 * Persisted field key, or null for an implicit map, record, or array field.
			 * Omitted when the difference applies to the node rather than a field.
			 */
			// eslint-disable-next-line @rushstack/no-new-null -- JSON must distinguish implicit fields from node locations.
			readonly fieldKey?: string | null;
	  };

/**
 * Describes one difference in schema constraints, persisted metadata, or view annotations.
 *
 * @remarks
 * Each entry describes one aspect at one location. Missing side properties indicate absent values.
 * The `existingStored` side describes the document's existing stored schema.
 * The `view` side describes the schema being evaluated for access, with its constraints in stored-schema form and all staged changes included,
 * together with its staging annotations and unknown optional field policy.
 * The `proposedStored` side describes the stored schema generated for an upgrade from the view schema and the configured staged upgrade policy,
 * as described by {@link SchemaCompatibilityStatus.canUpgrade}.
 * The proposed stored schema can differ from both the existing stored schema and the view's constraints.
 * The proposed stored schema does not imply that an upgrade has occurred or will occur.
 * The proposed stored schema can be identical to the existing stored schema.
 *
 * This is not a comparison of application classes, methods, or object identities, and it does not inspect document content.
 * Persisted metadata is compared by value and does not affect compatibility flags.
 * Non-persisted custom metadata and descriptions are not compared.
 * Staging annotations and the unknown optional field policy are view-only context, not properties of stored schema.
 * Their entries do not by themselves indicate a viewing or upgrade failure.
 * Membership in a condition-specific discrepancy list identifies which compatibility checks a difference prevents.
 *
 * Entries support JSON serialization without a custom replacer.
 * Ordering is deterministic within a library version, but no particular sorting rule is guaranteed.
 * Array position does not indicate severity or priority.
 *
 * @sealed
 * @alpha
 */
export type SchemaDiscrepancyAlpha = {
	/**
	 * Identifies the schema element that differs.
	 */
	readonly location: SchemaDiscrepancyLocationAlpha;
} & (
	| ({
			/**
			 * Identifies allowed-type membership or a staging annotation for one allowed type.
			 * Side values indicate whether that type is allowed or marked as staged, respectively.
			 * Existing and proposed stored schemas do not retain staging annotations.
			 */
			readonly mismatch: "allowedType" | "stagedType";
			/**
			 * Persisted identifier of the allowed type being compared.
			 */
			readonly allowedType: string;
	  } & SchemaDiscrepancyValues<boolean>)
	| ({
			/**
			 * Identifies a field-kind or leaf-value constraint difference.
			 * Side values are field-kind identifiers or leaf-value schema names, respectively.
			 */
			readonly mismatch: "fieldKind" | "valueSchema";
	  } & SchemaDiscrepancyValues<string>)
	| ({
			/**
			 * Identifies an explicit field definition, optionality staging, or unknown-field policy difference.
			 * Side values indicate whether the field definition, annotation, or policy is present or enabled.
			 * Existing and proposed stored schemas do not retain staging annotations or the view's unknown-field policy.
			 */
			readonly mismatch: "fieldPresence" | "stagedOptional" | "allowUnknownOptionalFields";
	  } & SchemaDiscrepancyValues<boolean>)
	| ({
			/**
			 * Identifies a node-kind difference between existing definitions.
			 * Side values describe only the kinds, not the complete node definitions.
			 */
			readonly mismatch: "nodeKind";
	  } & SchemaDiscrepancyValues<SchemaNodeKindDescription>)
	| ({
			/**
			 * Identifies a node definition that is absent from at least one schema.
			 * Present side values describe only the node kinds.
			 */
			readonly mismatch: "missingNode";
			/**
			 * Identifies every side without this definition.
			 */
			readonly missingFrom: readonly ("view" | "existingStored" | "proposedStored")[];
	  } & SchemaDiscrepancyValues<SchemaNodeKindDescription>)
	| ({
			/**
			 * Identifies a persisted metadata difference at a node or field.
			 * Side values contain the metadata values, compared independently of object property order.
			 * This difference does not prevent viewing, upgrading, or equivalence.
			 */
			readonly mismatch: "persistedMetadata";
	  } & SchemaDiscrepancyValues<JsonCompatibleReadOnly>)
);

/**
 * Values for one schema aspect on each side of the comparison.
 *
 * @remarks
 * Missing properties identify absent values, not values equal to false or null.
 * For boolean aspects, false indicates that the compared feature is absent or disabled.
 *
 * @typeParam T - Value representation for the aspect selected by the discrepancy's `mismatch` property.
 *
 * @alpha
 */
export interface SchemaDiscrepancyValues<T> {
	/**
	 * Describes the view schema's constraint, persisted metadata, or annotation at this location.
	 * Constraints include all staged changes, independently of the configured staged upgrade policy.
	 * Absent when that value does not exist.
	 */
	readonly view?: T;
	/**
	 * Describes the value in the document's existing stored schema. Absent when that value does not exist.
	 */
	readonly existingStored?: T;
	/**
	 * Describes the value in the proposed stored schema generated using the configured staged upgrade policy.
	 * This is the proposed stored schema used by {@link SchemaCompatibilityStatus.canUpgrade}, not the full view schema.
	 * Absent when that value does not exist.
	 */
	readonly proposedStored?: T;
}

/**
 * Describes a node kind without expanding its definition or references.
 * @alpha
 */
export interface SchemaNodeKindDescription {
	/**
	 * The node kind represented by the stored schema structure.
	 * Arrays are represented by an object with one sequence field at the empty key.
	 */
	readonly kind: "leaf" | "map" | "array" | "object";
}

/**
 * Reports whether the view schema can provide read-write access under the document's existing stored schema, and the differences that prevent access.
 *
 * @remarks
 * Uses the viewing check described by {@link SchemaCompatibilityStatus.canView}, not a comparison with the proposed stored schema.
 * The configured staged upgrade policy determines the proposed stored schema but does not change this viewing check.
 * `viewDiscrepancies` is absent when `canView` is true.
 * Narrow `canView` to false before accessing the nonempty blocker list.
 *
 * @sealed
 * @alpha
 */
export type SchemaCompatibilityViewableStatus =
	| {
			/**
			 * The view schema permits read-write access under the document's existing stored schema.
			 */
			readonly canView: true;
	  }
	| {
			/**
			 * Schema differences prevent read-write access through this view schema.
			 * Accessing {@link TreeView.root} throws.
			 */
			readonly canView: false;
			/**
			 * Differences that cause {@link SchemaCompatibilityStatus.canView} to be false.
			 * Contains at least one entry from {@link CompleteSchemaDiscrepanciesAlpha.allDiscrepancies}.
			 * Entries retain all three side values, but membership in this list depends on the view and existing stored schemas, not the proposed stored schema.
			 */
			readonly viewDiscrepancies: readonly SchemaDiscrepancyAlpha[];
	  };

/**
 * Reports whether the document's stored schema can be upgraded to the proposed stored schema generated from the view's configuration, and the differences that prevent that upgrade.
 *
 * @remarks
 * Uses the existing-to-proposed stored-schema check described by {@link SchemaCompatibilityStatus.canUpgrade}.
 * The proposed stored schema incorporates the configured staged upgrade policy, including whether to retain upgrades already enabled in the document.
 * `upgradeDiscrepancies` is absent when `canUpgrade` is true.
 * Narrow `canUpgrade` to false before accessing the nonempty blocker list.
 * A true flag does not mean that an upgrade is necessary or that it will change the stored schema.
 *
 * @sealed
 * @alpha
 */
export type SchemaCompatibilityUpgradeableStatus =
	| {
			/**
			 * The existing stored schema can be upgraded to the proposed stored schema generated from the view's configuration.
			 */
			readonly canUpgrade: true;
	  }
	| {
			/**
			 * Schema differences prevent upgrading to the proposed stored schema generated from the view's configuration.
			 * Calling {@link TreeView.upgradeSchema} throws a `UsageError`.
			 */
			readonly canUpgrade: false;
			/**
			 * Differences that cause {@link SchemaCompatibilityStatus.canUpgrade} to be false.
			 * Contains at least one entry from {@link CompleteSchemaDiscrepanciesAlpha.allDiscrepancies}.
			 * Entries retain all three side values, but membership in this list depends on the existing and proposed stored schemas.
			 */
			readonly upgradeDiscrepancies: readonly SchemaDiscrepancyAlpha[];
	  };

/**
 * Reports the equivalence described by {@link SchemaCompatibilityStatus.isEquivalent} and the differences that prevent it.
 *
 * @remarks
 * Equivalence requires viewing compatibility and successful stored-schema upgrade checks in both directions between the existing and proposed stored schemas.
 * The proposed stored schema is generated using the configured staged upgrade policy.
 * Equivalence does not require structural identity or equal persisted metadata.
 * `equivalenceDiscrepancies` is absent when `isEquivalent` is true.
 * Narrow `isEquivalent` to false before accessing the nonempty blocker list.
 *
 * @sealed
 * @alpha
 */
export type SchemaCompatibilityEquivalenceStatus =
	| {
			/**
			 * The view can access the document, and the existing and proposed stored schemas pass the upgrade checks in both directions.
			 * Calling {@link TreeView.upgradeSchema} makes no change to the stored schema.
			 */
			readonly isEquivalent: true;
	  }
	| {
			/**
			 * Viewing compatibility or at least one direction of the stored-schema upgrade checks fails.
			 * This does not by itself mean that viewing or upgrading will throw; check `canView` and `canUpgrade`, respectively.
			 */
			readonly isEquivalent: false;
			/**
			 * Differences that cause {@link SchemaCompatibilityStatus.isEquivalent} to be false.
			 * Contains at least one entry from {@link CompleteSchemaDiscrepanciesAlpha.allDiscrepancies}.
			 * Includes viewing blockers, upgrade blockers, and differences that prevent the reverse comparison from the proposed stored schema to the existing stored schema.
			 */
			readonly equivalenceDiscrepancies: readonly SchemaDiscrepancyAlpha[];
	  };

/**
 * Reports differences in schema constraints, persisted metadata, and view annotations across the view, existing stored schema, and proposed stored schema.
 * @sealed
 * @alpha
 */
export interface CompleteSchemaDiscrepanciesAlpha {
	/**
	 * Contains every distinct difference in the aspects described by {@link SchemaDiscrepancyAlpha}.
	 *
	 * @remarks
	 * Reports the root field and node definitions, including stored definitions that are not reachable from the root.
	 * Each entry describes values from the view, existing stored schema, and proposed stored schema where applicable.
	 * The proposed stored schema is generated using the configured staged upgrade policy, as described by {@link SchemaCompatibilityStatus.canUpgrade}.
	 * This is not solely a diff between the existing and proposed stored schemas: it also includes view-only staging annotations and unknown optional field policy.
	 * It does not inspect the document's current content or explain {@link SchemaCompatibilityStatus.canInitialize}.
	 *
	 * This array is always available and can be nonempty when all compatibility flags are true.
	 * Non-persisted custom metadata and descriptions are excluded. Their absence from stored schema
	 * is not a discrepancy. For example, changing a schema description is ignored, while changing
	 * `persistedMetadata` produces a discrepancy without changing compatibility flags.
	 * The condition-specific lists select unchanged entries from this array.
	 * A discrepancy can belong to more than one condition-specific list.
	 *
	 * @example Serializing discrepancies
	 * ```typescript
	 * console.log(JSON.stringify(view.compatibility.allDiscrepancies));
	 * ```
	 */
	readonly allDiscrepancies: readonly SchemaDiscrepancyAlpha[];
}

/**
 * Reports compatibility for a view's configuration and document, with schema differences and conditional blocker subsets.
 *
 * @remarks
 * Extends {@link SchemaCompatibilityStatusBeta} without changing its flags or beta discrepancy details.
 * Viewing discrepancies explain access under the existing stored schema; upgrade discrepancies explain the transition to the configuration's proposed stored schema.
 * Equivalence discrepancies also include failures of the reverse stored-schema comparison.
 * The complete list also includes differences that do not affect compatibility.
 * None of these lists determines whether the document is uninitialized; {@link SchemaCompatibilityStatus.canInitialize} reports that state separately.
 *
 * @sealed
 * @alpha
 */
export type SchemaCompatibilityStatusAlpha = SchemaCompatibilityStatusBeta &
	CompleteSchemaDiscrepanciesAlpha &
	SchemaCompatibilityViewableStatus &
	SchemaCompatibilityUpgradeableStatus &
	SchemaCompatibilityEquivalenceStatus;

/**
 * Reports schema comparison results without document initialization state.
 *
 * @remarks
 * Provides the same diagnostic lists and conditional access as {@link SchemaCompatibilityStatusAlpha}.
 * Used by {@link checkCompatibility} and {@link comparePersistedSchema}, which do not inspect document content.
 *
 * @sealed
 * @alpha
 */
export type SchemaComparisonStatusAlpha = Omit<
	SchemaCompatibilityStatusBeta,
	"canInitialize"
> &
	CompleteSchemaDiscrepanciesAlpha &
	SchemaCompatibilityViewableStatus &
	SchemaCompatibilityUpgradeableStatus &
	SchemaCompatibilityEquivalenceStatus;

type SchemaSide = "view" | "stored" | "target";
type Values = Record<SchemaSide, JsonCompatibleReadOnly | undefined>;
type Fields = Record<SchemaSide, TreeFieldStoredSchema | undefined>;
type Nodes = Record<SchemaSide, TreeNodeStoredSchema | undefined>;
/**
 * Internal checks that select blocker subsets without adding check labels to public entries.
 * `upgrade` compares stored to target; `reverse` compares target to stored for equivalence.
 */
type Blocker = "view" | "upgrade" | "reverse";

/**
 * Copies a JSON-compatible value with object keys in deterministic order.
 *
 * @remarks
 * Array order is preserved. Undefined object properties are omitted, and undefined array entries become null.
 * Callers must pass only comparison data or persisted metadata, never non-persisted metadata.
 *
 * @param value - Value to normalize. Object and array values must be acyclic.
 * @returns A normalized copy, or the original value when it is a primitive or undefined.
 */
function canonical(
	value: JsonCompatibleReadOnly | undefined,
): JsonCompatibleReadOnly | undefined {
	if (value === undefined || value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => canonical(item) ?? null);
	}
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.flatMap((key) => {
				const item = canonical(
					(value as { readonly [key: string]: JsonCompatibleReadOnly })[key],
				);
				return item === undefined ? [] : [[key, item]];
			}),
	);
}

/**
 * Classifies the stored representation without expanding referenced node definitions.
 *
 * @param node - Node definition to classify, or undefined for a missing definition.
 * @returns The diagnostic node kind, or undefined if the definition is absent or unrecognized.
 */
function nodeKind(
	node: TreeNodeStoredSchema | undefined,
): SchemaNodeKindDescription["kind"] | undefined {
	if (node instanceof LeafNodeStoredSchema) {
		return "leaf";
	}
	if (node instanceof MapNodeStoredSchema) {
		return "map";
	}
	if (node instanceof ObjectNodeStoredSchema) {
		// Stored arrays use an object containing a single sequence field at the empty key.
		return node.objectNodeFields.size === 1 &&
			node.objectNodeFields.get(EmptyKey)?.kind === FieldKinds.sequence.identifier
			? "array"
			: "object";
	}
	return undefined;
}

/**
 * Gets fields by their stored keys, with null representing a map's implicit field.
 *
 * @remarks
 * Object keys are preserved, including the empty key used by stored arrays.
 * The caller converts array field keys to diagnostic locations separately.
 *
 * @param node - Node definition whose fields are needed.
 * @returns The node's fields, or an empty map for leaves and missing definitions.
 */
function fieldsOf(
	node: TreeNodeStoredSchema | undefined,
	// eslint-disable-next-line @rushstack/no-new-null -- Matches the serializable location representation.
): ReadonlyMap<string | null, TreeFieldStoredSchema> {
	if (node instanceof MapNodeStoredSchema) {
		return new Map([[null, node.mapFields]]);
	}
	if (node instanceof ObjectNodeStoredSchema) {
		return node.objectNodeFields;
	}
	return new Map();
}

/**
 * Collects schema differences and selects the entries that block each compatibility check.
 *
 * @remarks
 * Viewing blockers come from the existing compatibility check to preserve its staging and policy rules.
 * Upgrade and reverse-comparison blockers use the stored schema rules.
 * The caller derives public compatibility flags from the presence of blockers in these results.
 *
 * Schema differences include persisted metadata and explicit staging annotations.
 * Non-persisted custom metadata and descriptions are not read.
 * Entries are deduplicated before the result lists are selected.
 * All lists use the same deterministic order and share entry objects.
 *
 * @param view - View schema, including staging annotations and persisted metadata.
 * @param stored - Current stored schema, including definitions unreachable from its root.
 * @param target - Effective proposed stored schema after applying the configured staging policy.
 * @param viewFailures - Raw viewing discrepancies for these inputs from the existing compatibility check.
 * @returns The complete list and its viewing, upgrade, and equivalence blocker subsets.
 * Successful checks have empty subsets here; the caller omits those properties from the public status.
 */
export function collectSchemaDiagnostics(
	view: TreeSchema,
	stored: TreeStoredSchema,
	target: TreeStoredSchema,
	viewFailures: readonly Discrepancy[],
): {
	all: readonly SchemaDiscrepancyAlpha[];
	view: readonly SchemaDiscrepancyAlpha[];
	upgrade: readonly SchemaDiscrepancyAlpha[];
	equivalence: readonly SchemaDiscrepancyAlpha[];
} {
	// Include all staged content when representing the view; target retains the effective staging policy.
	const viewed = toUpgradeSchema(view.root, StagedSchemaUpgradePolicy.permissive);
	const entries = new Map<string, SchemaDiscrepancyAlpha>();
	const blockers = new Map<SchemaDiscrepancyAlpha, Set<Blocker>>();
	const byAspect = new Map<string, SchemaDiscrepancyAlpha>();

	/**
	 * Identifies an aspect without including its values or comparison direction.
	 *
	 * @param location - Schema element containing the difference.
	 * @param mismatch - Aspect being compared at this location.
	 * @param allowedType - Type identifier for allowed-type and staged-type differences; otherwise omitted.
	 * @returns A serialized key used to match compatibility blockers to diagnostic entries.
	 */
	function aspectKey(
		location: SchemaDiscrepancyLocationAlpha,
		mismatch: SchemaDiscrepancyAlpha["mismatch"],
		allowedType?: string,
	): string {
		return JSON.stringify([location, mismatch, allowedType]);
	}

	/**
	 * Records one distinct aspect difference without classifying it as a blocker.
	 *
	 * @param mismatch - Aspect being compared. The caller must supply the matching value representation.
	 * @param location - Schema element containing the difference.
	 * @param values - Values on each side, with undefined for absent values.
	 * @param allowedType - Type identifier, supplied only for allowed-type and staged-type differences.
	 * @returns The shared entry for the difference, or undefined when all three values are equal.
	 */
	function add(
		mismatch: SchemaDiscrepancyAlpha["mismatch"],
		location: SchemaDiscrepancyLocationAlpha,
		values: Values,
		allowedType?: string,
	): SchemaDiscrepancyAlpha | undefined {
		// Skip equal primitives and shared references before copying or serializing values.
		if (values.view === values.stored && values.target === values.stored) {
			return undefined;
		}
		// Compare metadata by value, independent of object property insertion order.
		const normalized = {
			view: canonical(values.view),
			existingStored: canonical(values.stored),
			proposedStored: canonical(values.target),
		};
		if (
			JSON.stringify(normalized.view) === JSON.stringify(normalized.existingStored) &&
			JSON.stringify(normalized.proposedStored) === JSON.stringify(normalized.existingStored)
		) {
			return undefined;
		}
		const data = {
			mismatch,
			location,
			...(mismatch === "missingNode"
				? {
						missingFrom: (["view", "existingStored", "proposedStored"] as const).filter(
							(side) => normalized[side] === undefined,
						),
					}
				: {}),
			...(allowedType === undefined ? {} : { allowedType }),
			...(normalized.view === undefined ? {} : { view: normalized.view }),
			...(normalized.existingStored === undefined
				? {}
				: { existingStored: normalized.existingStored }),
			...(normalized.proposedStored === undefined
				? {}
				: { proposedStored: normalized.proposedStored }),
		};
		const entry = data as SchemaDiscrepancyAlpha;
		const key = JSON.stringify(entry);
		// Reuse the same entry when multiple comparisons identify the same difference.
		const previous = entries.get(key);
		if (previous !== undefined) {
			return previous;
		}
		entries.set(key, entry);
		byAspect.set(aspectKey(location, mismatch, allowedType), entry);
		blockers.set(entry, new Set());
		return entry;
	}

	/**
	 * Associates an existing difference with a failed check without changing its public payload.
	 *
	 * @param location - Location of the failed comparison.
	 * @param mismatch - Aspect rejected by the authoritative comparison.
	 * @param check - Check blocked by the difference.
	 * @param allowedType - Identifier for an allowed-type failure.
	 */
	function mark(
		location: SchemaDiscrepancyLocationAlpha,
		mismatch: SchemaDiscrepancyAlpha["mismatch"],
		check: Blocker,
		allowedType?: string,
	): void {
		const entry =
			byAspect.get(aspectKey(location, mismatch, allowedType)) ??
			byAspect.get(aspectKey(location, "missingNode")) ??
			byAspect.get(aspectKey(location, "fieldPresence"));
		assert(entry !== undefined, "Every compatibility failure must have a diagnostic entry");
		blockers.get(entry)?.add(check);
	}

	/**
	 * Converts stored comparison field locations to the public diagnostic representation.
	 *
	 * @param identifier - Containing node identifier, or undefined for the root field.
	 * @param fieldKey - Stored field key. Stored-schema failures use EmptyKey for the root and implicit map fields.
	 * Viewing failures can use undefined for these locations.
	 * @returns The corresponding public field location.
	 */
	function fieldLocation(
		identifier: string | undefined,
		fieldKey: string | undefined,
	): SchemaDiscrepancyLocationAlpha {
		if (identifier === undefined) return "root";
		return {
			nodeType: identifier,
			fieldKey:
				fieldKey === EmptyKey &&
				(view.definitions.get(identifier)?.kind === NodeKind.Array ||
					nodeKind(stored.nodeSchema.get(brand(identifier))) === "array" ||
					((view.definitions.get(identifier)?.kind === NodeKind.Map ||
						view.definitions.get(identifier)?.kind === NodeKind.Record) &&
						stored.nodeSchema.get(brand(identifier)) instanceof MapNodeStoredSchema))
					? null
					: (fieldKey ?? null),
		};
	}

	/**
	 * Records structural field differences without evaluating compatibility policy.
	 *
	 * @param location - Location shared by the fields being compared.
	 * @param fields - Explicit field definitions on each side, before substituting absent fields.
	 */
	function compareFields(location: SchemaDiscrepancyLocationAlpha, fields: Fields): void {
		// Preserve absent-versus-explicit differences even when both fields forbid all content.
		add("fieldPresence", location, {
			view: fields.view !== undefined,
			stored: fields.stored !== undefined,
			target: fields.target !== undefined,
		});
		// Compatibility treats an absent field as a forbidden field with no allowed types.
		const actual = {
			view: fields.view ?? storedEmptyFieldSchema,
			stored: fields.stored ?? storedEmptyFieldSchema,
			target: fields.target ?? storedEmptyFieldSchema,
		};
		add("fieldKind", location, {
			view: actual.view.kind,
			stored: actual.stored.kind,
			target: actual.target.kind,
		});
		for (const type of new Set([
			...actual.view.types,
			...actual.stored.types,
			...actual.target.types,
		])) {
			add(
				"allowedType",
				location,
				{
					view: actual.view.types.has(type),
					stored: actual.stored.types.has(type),
					target: actual.target.types.has(type),
				},
				type,
			);
		}
		add("persistedMetadata", location, {
			view: fields.view?.persistedMetadata,
			stored: fields.stored?.persistedMetadata,
			target: fields.target?.persistedMetadata,
		});
	}

	/**
	 * Records view-only staging annotations independently of their effect on the proposed stored schema.
	 *
	 * @param location - Location of the annotated field.
	 * @param field - View field whose allowed types and optionality may be staged.
	 */
	function staging(location: SchemaDiscrepancyLocationAlpha, field: SimpleFieldSchema): void {
		for (const [type, attributes] of field.simpleAllowedTypes) {
			if (attributes.isStaged !== undefined && attributes.isStaged !== false) {
				add("stagedType", location, { view: true, stored: false, target: false }, type);
			}
		}
		if (field.isStagedOptional !== undefined && field.isStagedOptional !== false) {
			add("stagedOptional", location, { view: true, stored: false, target: false });
		}
	}

	compareFields("root", {
		view: viewed.rootFieldSchema,
		stored: stored.rootFieldSchema,
		target: target.rootFieldSchema,
	});
	staging("root", view.root);
	// Compare every definition, including stored definitions unreachable from the root.
	for (const identifier of new Set([
		...viewed.nodeSchema.keys(),
		...stored.nodeSchema.keys(),
		...target.nodeSchema.keys(),
	])) {
		const location = { nodeType: identifier };
		const nodes: Nodes = {
			view: viewed.nodeSchema.get(identifier),
			stored: stored.nodeSchema.get(identifier),
			target: target.nodeSchema.get(identifier),
		};
		const kinds = {
			view: nodeKind(nodes.view),
			stored: nodeKind(nodes.stored),
			target: nodeKind(nodes.target),
		};
		const missing = Object.values(nodes).includes(undefined);
		add(missing ? "missingNode" : "nodeKind", location, {
			view: kinds.view === undefined ? undefined : { kind: kinds.view },
			stored: kinds.stored === undefined ? undefined : { kind: kinds.stored },
			target: kinds.target === undefined ? undefined : { kind: kinds.target },
		});
		// Avoid expanding a missing definition or a leaf/non-leaf mismatch into value details.
		if (kinds.view === "leaf" && kinds.stored === "leaf") {
			add("valueSchema", location, {
				view:
					nodes.view instanceof LeafNodeStoredSchema
						? ValueSchema[nodes.view.leafValue]
						: undefined,
				stored:
					nodes.stored instanceof LeafNodeStoredSchema
						? ValueSchema[nodes.stored.leafValue]
						: undefined,
				target:
					nodes.target instanceof LeafNodeStoredSchema
						? ValueSchema[nodes.target.leafValue]
						: undefined,
			});
		}
		add("persistedMetadata", location, {
			view: nodes.view?.metadata,
			stored: nodes.stored?.metadata,
			target: nodes.target?.metadata,
		});
		const fields = {
			view: fieldsOf(nodes.view),
			stored: fieldsOf(nodes.stored),
			target: fieldsOf(nodes.target),
		};
		if (
			nodes.view !== undefined &&
			nodes.stored !== undefined &&
			kinds.view !== "leaf" &&
			kinds.stored !== "leaf"
		) {
			for (const fieldKey of new Set([
				...fields.view.keys(),
				...fields.stored.keys(),
				...fields.target.keys(),
			])) {
				// Compare object fields against the map's implicit field, not an extra synthetic field.
				if (
					fieldKey === null &&
					(nodes.view instanceof ObjectNodeStoredSchema ||
						nodes.stored instanceof ObjectNodeStoredSchema)
				) {
					continue;
				}
				compareFields(
					{
						nodeType: identifier,
						fieldKey:
							fieldKey === EmptyKey && (kinds.view === "array" || kinds.stored === "array")
								? null
								: fieldKey,
					},
					{
						view:
							fields.view.get(fieldKey) ??
							(nodes.view instanceof MapNodeStoredSchema ? fields.view.get(null) : undefined),
						stored:
							fields.stored.get(fieldKey) ??
							(nodes.stored instanceof MapNodeStoredSchema
								? fields.stored.get(null)
								: undefined),
						target:
							fields.target.get(fieldKey) ??
							(nodes.target instanceof MapNodeStoredSchema
								? fields.target.get(null)
								: undefined),
					},
				);
			}
		}
		// Stored representations omit staging and unknown-field policies; read these from the view.
		const viewNode = view.definitions.get(identifier);
		if (viewNode?.kind === NodeKind.Object) {
			for (const field of viewNode.fields.values()) {
				staging({ nodeType: identifier, fieldKey: field.storedKey }, field);
			}
			if (viewNode.allowUnknownOptionalFields === true) {
				add("allowUnknownOptionalFields", location, {
					view: true,
					stored: false,
					target: false,
				});
			}
		} else if (viewNode !== undefined && viewNode.kind !== NodeKind.Leaf) {
			for (const [type, attributes] of viewNode.simpleAllowedTypes) {
				if (attributes.isStaged !== undefined && attributes.isStaged !== false) {
					add(
						"stagedType",
						{ nodeType: identifier, fieldKey: null },
						{ view: true, stored: false, target: false },
						type,
					);
				}
			}
		}
	}
	// Reuse viewing decisions and beta context from the pre-target analysis.
	for (const failure of viewFailures) {
		if (failure.mismatch === "allowedTypes") {
			const location = fieldLocation(failure.identifier, failure.fieldKey);
			for (const { type } of failure.view)
				mark(location, "allowedType", "view", type.identifier);
			for (const type of failure.stored) mark(location, "allowedType", "view", type);
		} else if (failure.mismatch === "fieldKind") {
			mark(fieldLocation(failure.identifier, failure.fieldKey), "fieldKind", "view");
		} else {
			mark({ nodeType: failure.identifier }, failure.mismatch, "view");
		}
	}

	// These failure streams are also the source of truth for boolean-only stored-schema comparisons.
	for (const [check, original, superset] of [
		["upgrade", stored, target],
		["reverse", target, stored],
	] as const) {
		for (const failure of getStoredSchemaSupersetFailures(
			defaultSchemaPolicy,
			original,
			superset,
		)) {
			const location =
				"fieldKey" in failure
					? fieldLocation(failure.identifier, failure.fieldKey)
					: { nodeType: failure.identifier };
			mark(
				location,
				failure.mismatch,
				check,
				"allowedType" in failure ? failure.allowedType : undefined,
			);
		}
	}
	// Sort once so every subset preserves the complete list's order and entry identities.
	const all = [...entries.entries()]
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([, entry]) => entry);
	return {
		all,
		view: all.filter((entry) => blockers.get(entry)?.has("view") === true),
		upgrade: all.filter((entry) => blockers.get(entry)?.has("upgrade") === true),
		// Equivalence requires viewing compatibility and superset checks in both directions.
		equivalence: all.filter((entry) => (blockers.get(entry)?.size ?? 0) > 0),
	};
}
