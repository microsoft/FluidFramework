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
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	ValueSchema,
} from "../../core/index.js";
import {
	defaultSchemaPolicy,
	FieldKinds,
	getStoredSchemaSupersetFailures,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
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
 * The root field uses `"root"`.
 * A node location omits `fieldKey`.
 * An implicit map, record, or array field uses `fieldKey: null`.
 *
 * @alpha
 */
export type SchemaDiscrepancyLocationAlpha =
	| "root"
	| {
			/**
			 * Identifies the node schema containing the difference using its persisted identifier.
			 */
			readonly nodeType: string;
			/**
			 * Identifies the field using its persisted key, or null for an implicit map, record, or array field.
			 * This property is omitted when the difference applies to the node rather than a field.
			 */
			// eslint-disable-next-line @rushstack/no-new-null -- JSON must distinguish implicit fields from node locations.
			readonly fieldKey?: string | null;
	  };

/**
 * Describes one schema constraint that prevents a compatibility check from succeeding.
 *
 * @remarks
 * Each entry describes one aspect at one location.
 * Missing side properties indicate absent values, subject to the absent-field rules in {@link SchemaDiscrepancyValues}.
 * The `existingStored` side describes the document's existing stored schema.
 * The `view` side describes the schema being evaluated for access, with its constraints in stored-schema form and all staged changes included.
 * Relevant staging and unknown optional field context is reported separately.
 * The `proposedStored` side describes the stored schema generated for an upgrade from the view schema and the configured staged upgrade policy,
 * as described by {@link SchemaCompatibilityStatus.canUpgrade}.
 * The proposed stored schema can differ from both the existing stored schema and the view's constraints.
 * The proposed stored schema does not imply that an upgrade has occurred or will occur.
 * The proposed stored schema can be identical to the existing stored schema.
 *
 * This is not a comparison of application classes, methods, or object identities, and it does not inspect document content.
 * Metadata and descriptions do not affect compatibility and are not reported.
 * Staging annotations and the unknown optional field policy provide context for constraint failures, not standalone discrepancies.
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
	/**
	 * Indicates whether the allowed type is staged in the view.
	 * This property is present only when true on an allowed-type discrepancy.
	 * The configured upgrade policy determines whether the type is included in the proposed stored schema.
	 */
	readonly viewIsStagedType?: true;
	/**
	 * Indicates whether the field's optionality is staged in the view.
	 * This property is present only when true on a field discrepancy.
	 */
	readonly viewIsStagedOptional?: true;
	/**
	 * Indicates whether the containing view object permits unknown optional fields.
	 * This property is present only when true on a field discrepancy.
	 * This can permit viewing without permitting removal of those fields from the stored schema.
	 */
	readonly viewAllowsUnknownOptionalFields?: true;
} & (
	| ({
			/**
			 * Identifies allowed-type membership that prevents the check from succeeding.
			 * Side values indicate whether that type is allowed.
			 */
			readonly mismatch: "allowedType";
			/**
			 * Identifies the allowed type being compared using its persisted identifier.
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
			 * Identifies a node-kind difference between existing definitions.
			 * Side values describe only the kinds, not the complete node definitions.
			 */
			readonly mismatch: "nodeKind";
	  } & SchemaDiscrepancyValues<SchemaNodeKindDescription>)
	| ({
			/**
			 * Identifies a node definition that is absent from at least one of the two schemas used by the failed check.
			 * Present side values describe only the node kinds.
			 */
			readonly mismatch: "missingNode";
			/**
			 * Identifies every side without this definition.
			 */
			readonly missingFrom: readonly ("view" | "existingStored" | "proposedStored")[];
	  } & SchemaDiscrepancyValues<SchemaNodeKindDescription>)
);

/**
 * Contains values for one schema aspect on each side of the comparison.
 *
 * @remarks
 * Missing properties identify absent values, not values equal to false or null.
 * For boolean aspects, false indicates that the compared feature is absent or disabled.
 * Field comparisons treat an absent field as a forbidden field with no allowed types.
 * Its field-kind value is `"Forbidden"`, and its allowed-type membership values are false.
 *
 * @typeParam T - Value representation for the aspect selected by the discrepancy's `mismatch` property.
 *
 * @alpha
 */
export interface SchemaDiscrepancyValues<T> {
	/**
	 * Describes the view schema's constraint at this location.
	 * Constraints include all staged changes, independently of the configured staged upgrade policy.
	 * This property is absent when that value does not exist.
	 */
	readonly view?: T;
	/**
	 * Describes the value in the document's existing stored schema.
	 * This property is absent when that value does not exist.
	 */
	readonly existingStored?: T;
	/**
	 * Describes the value in the proposed stored schema generated using the configured staged upgrade policy.
	 * This is the proposed stored schema used by {@link SchemaCompatibilityStatus.canUpgrade}, not the full view schema.
	 * This property is absent when that value does not exist.
	 */
	readonly proposedStored?: T;
}

/**
 * Describes a node kind without expanding its definition or references.
 * @alpha
 */
export interface SchemaNodeKindDescription {
	/**
	 * Describes the node kind represented by the stored schema structure.
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
			 * Lists differences that cause {@link SchemaCompatibilityStatus.canView} to be false.
			 * The list contains at least one entry and excludes differences accepted by the viewing rules.
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
			 * Lists differences that cause {@link SchemaCompatibilityStatus.canUpgrade} to be false.
			 * The list contains at least one entry and excludes differences accepted by the upgrade rules.
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
			 * Lists differences that cause {@link SchemaCompatibilityStatus.isEquivalent} to be false.
			 * The list contains at least one entry and excludes differences accepted by all equivalence checks.
			 * Includes viewing blockers, upgrade blockers, and differences that prevent the reverse comparison from the proposed stored schema to the existing stored schema.
			 */
			readonly equivalenceDiscrepancies: readonly SchemaDiscrepancyAlpha[];
	  };

/**
 * Reports compatibility for a view's configuration and document, with conditional blocker lists.
 *
 * @remarks
 * Extends {@link SchemaCompatibilityStatusBeta} without changing its flags or beta discrepancy details.
 * Viewing discrepancies explain access under the existing stored schema; upgrade discrepancies explain the transition to the configuration's proposed stored schema.
 * Equivalence discrepancies also include failures of the reverse stored-schema comparison.
 * These lists explain failed checks, not all schema differences or the changes a permitted upgrade would make.
 * Persisted metadata differences and standalone view annotations are not reported.
 * None of these lists determines whether the document is uninitialized; {@link SchemaCompatibilityStatus.canInitialize} reports that state separately.
 *
 * @sealed
 * @alpha
 */
export type SchemaCompatibilityStatusAlpha = SchemaCompatibilityStatusBeta &
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
	SchemaCompatibilityViewableStatus &
	SchemaCompatibilityUpgradeableStatus &
	SchemaCompatibilityEquivalenceStatus;

type SchemaSide = "view" | "stored" | "target";
type Values = Record<SchemaSide, boolean | string | SchemaNodeKindDescription | undefined>;
type Nodes = Record<SchemaSide, TreeNodeStoredSchema | undefined>;
/**
 * Identifies internal checks that select blocker lists without adding check labels to public entries.
 * `upgrade` compares stored to target; `reverse` compares target to stored for equivalence.
 */
type Blocker = "view" | "upgrade" | "reverse";

/**
 * Classifies the stored representation without expanding referenced node definitions.
 *
 * @param node - Node definition to classify, or undefined for a missing definition.
 * @returns The diagnostic node kind, or undefined if the definition is absent or unrecognized.
 */
function getNodeKind(
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
 * Constructs diagnostics for failures of the viewing and stored-schema compatibility checks.
 *
 * @remarks
 * Viewing blockers come from the existing compatibility check to preserve its staging and policy rules.
 * Upgrade and reverse-comparison blockers use the stored schema rules.
 * The caller derives public compatibility flags from the presence of blockers in these results.
 *
 * Relevant view annotations provide context on constraint failures.
 * Metadata and descriptions are not compared.
 * Entries are deduplicated before the result lists are selected.
 * All lists use the same deterministic order and share entry objects.
 *
 * @param view - View schema, including staging annotations and unknown optional field policy.
 * @param stored - Existing stored schema, including definitions unreachable from its root.
 * @param target - Effective proposed stored schema after applying the configured staging policy.
 * @param viewFailures - Raw viewing discrepancies for these inputs from the existing compatibility check.
 * @returns Viewing, upgrade, and equivalence blocker lists.
 * Successful checks have empty lists here; the caller omits those properties from the public status.
 */
export function collectSchemaDiagnostics(
	view: TreeSchema,
	stored: TreeStoredSchema,
	target: TreeStoredSchema,
	viewFailures: readonly Discrepancy[],
): {
	view: readonly SchemaDiscrepancyAlpha[];
	upgrade: readonly SchemaDiscrepancyAlpha[];
	equivalence: readonly SchemaDiscrepancyAlpha[];
} {
	// Include all staged content when representing the view; target retains the effective staging policy.
	const viewed = toUpgradeSchema(view.root, StagedSchemaUpgradePolicy.permissive);
	const entries = new Map<
		string,
		{ entry: SchemaDiscrepancyAlpha; view: boolean; upgrade: boolean }
	>();

	/**
	 * Records one distinct aspect difference and which check it prevents.
	 *
	 * @param mismatch - Aspect being compared. The caller must supply the matching value representation.
	 * @param location - Schema element containing the difference.
	 * @param values - Values on each side, with undefined for absent values.
	 * @param allowedType - Type identifier, supplied only for allowed-type differences.
	 * @param check - Check blocked by the difference.
	 */
	function add(
		mismatch: SchemaDiscrepancyAlpha["mismatch"],
		location: SchemaDiscrepancyLocationAlpha,
		values: Values,
		allowedType: string | undefined,
		check: Blocker,
	): void {
		const normalized = {
			view: values.view,
			existingStored: values.stored,
			proposedStored: values.target,
		};
		const viewNode = location === "root" ? undefined : view.definitions.get(location.nodeType);
		const isField = location === "root" || location.fieldKey !== undefined;
		let viewField: SimpleFieldSchema | undefined;
		if (location === "root") {
			viewField = view.root;
		} else if (isField && viewNode?.kind === NodeKind.Object) {
			viewField = [...viewNode.fields.values()].find(
				(field) => field.storedKey === (location.fieldKey ?? EmptyKey),
			);
		}
		const allowedTypes =
			viewField?.simpleAllowedTypes ??
			(isField &&
			viewNode !== undefined &&
			viewNode.kind !== NodeKind.Leaf &&
			viewNode.kind !== NodeKind.Object
				? viewNode.simpleAllowedTypes
				: undefined);
		const isStagedType =
			allowedType !== undefined &&
			allowedTypes !== undefined &&
			[...allowedTypes].some(
				([type, attributes]) =>
					type === allowedType &&
					attributes.isStaged !== undefined &&
					attributes.isStaged !== false,
			);
		const data = {
			mismatch,
			location,
			...(isStagedType ? { viewIsStagedType: true } : {}),
			...(viewField?.isStagedOptional !== undefined && viewField.isStagedOptional !== false
				? { viewIsStagedOptional: true }
				: {}),
			...(isField &&
			viewNode?.kind === NodeKind.Object &&
			viewNode.allowUnknownOptionalFields === true
				? { viewAllowsUnknownOptionalFields: true }
				: {}),
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
		const record = entries.get(key) ?? { entry, view: false, upgrade: false };
		if (check !== "reverse") {
			record[check] = true;
		}
		entries.set(key, record);
	}

	/**
	 * Constructs an entry for a failed check and records which check it prevents.
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
		allowedType: string | undefined,
	): void {
		const identifier =
			location === "root" ? undefined : brand<TreeNodeSchemaIdentifier>(location.nodeType);
		const nodes: Nodes = {
			view: identifier === undefined ? undefined : viewed.nodeSchema.get(identifier),
			stored: identifier === undefined ? undefined : stored.nodeSchema.get(identifier),
			target: identifier === undefined ? undefined : target.nodeSchema.get(identifier),
		};
		const entryMismatch =
			location !== "root" &&
			location.fieldKey === undefined &&
			(nodes.stored === undefined ||
				(check === "view" ? nodes.view : nodes.target) === undefined)
				? "missingNode"
				: mismatch;
		/**
		 * Gets the constraint value for one side of the failed check.
		 *
		 * @param side - Schema whose constraint is needed.
		 * @returns The constraint value, or undefined for an absent node definition.
		 */
		function getValue(side: SchemaSide): Values[SchemaSide] {
			const node = nodes[side];
			if (location === "root" || location.fieldKey !== undefined) {
				const schema = side === "view" ? viewed : side === "stored" ? stored : target;
				const field =
					location === "root"
						? schema.rootFieldSchema
						: node instanceof MapNodeStoredSchema
							? node.mapFields
							: node instanceof ObjectNodeStoredSchema
								? node.objectNodeFields.get(brand(location.fieldKey ?? EmptyKey))
								: undefined;
				const actual = field ?? storedEmptyFieldSchema;
				if (mismatch === "allowedType") {
					assert(allowedType !== undefined, "An allowed-type failure must identify its type");
					return actual.types.has(brand(allowedType));
				}
				return actual.kind;
			}
			if (entryMismatch === "valueSchema") {
				return node instanceof LeafNodeStoredSchema ? ValueSchema[node.leafValue] : undefined;
			}
			const kind = getNodeKind(node);
			return kind === undefined ? undefined : { kind };
		}
		add(
			entryMismatch,
			location,
			{
				view: getValue("view"),
				stored: getValue("stored"),
				target: getValue("target"),
			},
			allowedType,
			check,
		);
	}

	/**
	 * Converts stored comparison field locations to the public diagnostic representation.
	 *
	 * @param identifier - Containing node identifier, or undefined for the root field.
	 * @param fieldKey - Stored field key. Stored-schema failures use EmptyKey for the root and implicit map fields.
	 * Viewing failures can use undefined for these locations.
	 * @returns The corresponding public field location.
	 */
	function getFieldLocation(
		identifier: string | undefined,
		fieldKey: string | undefined,
	): SchemaDiscrepancyLocationAlpha {
		if (identifier === undefined) {
			return "root";
		}
		return {
			nodeType: identifier,
			fieldKey:
				fieldKey === EmptyKey &&
				(view.definitions.get(identifier)?.kind === NodeKind.Array ||
					getNodeKind(stored.nodeSchema.get(brand(identifier))) === "array" ||
					((view.definitions.get(identifier)?.kind === NodeKind.Map ||
						view.definitions.get(identifier)?.kind === NodeKind.Record) &&
						stored.nodeSchema.get(brand(identifier)) instanceof MapNodeStoredSchema))
					? null
					: (fieldKey ?? null),
		};
	}

	// Reuse viewing decisions and beta context from the pre-target analysis.
	for (const failure of viewFailures) {
		if (failure.mismatch === "allowedTypes") {
			const location = getFieldLocation(failure.identifier, failure.fieldKey);
			for (const { type } of failure.view) {
				mark(location, "allowedType", "view", type.identifier);
			}
			for (const type of failure.stored) {
				mark(location, "allowedType", "view", type);
			}
		} else if (failure.mismatch === "fieldKind") {
			mark(
				getFieldLocation(failure.identifier, failure.fieldKey),
				"fieldKind",
				"view",
				undefined,
			);
		} else {
			mark({ nodeType: failure.identifier }, failure.mismatch, "view", undefined);
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
					? getFieldLocation(failure.identifier, failure.fieldKey)
					: { nodeType: failure.identifier };
			mark(
				location,
				failure.mismatch,
				check,
				"allowedType" in failure ? failure.allowedType : undefined,
			);
		}
	}
	const ordered = [...entries.entries()]
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([, record]) => record);
	return {
		view: ordered.filter((record) => record.view).map(({ entry }) => entry),
		upgrade: ordered.filter((record) => record.upgrade).map(({ entry }) => entry),
		// Equivalence requires viewing compatibility and superset checks in both directions.
		equivalence: ordered.map(({ entry }) => entry),
	};
}
