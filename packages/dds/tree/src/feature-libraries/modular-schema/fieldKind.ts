/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FieldKindIdentifier,
	FieldKindData,
	Multiplicity,
	SchemaPolicy,
	TreeFieldStoredSchema,
	TreeStoredSchema,
	TreeTypeSet,
} from "../../core/index.js";
import type { MakeNominal } from "../../util/index.js";

import type { FieldChangeHandler, FieldEditor } from "./fieldChangeHandler.js";
import { isNeverField } from "./isNeverTree.js";

/**
 * Functionality for FieldKinds that is stable,
 * meaning that it can not change in any measurable way without providing a new identifier.
 *
 * It is assumed that this information and policy is available on all clients interacting with a document
 * using the identifier.
 *
 * This must contain enough information to process remote edits to this FieldKind consistently with all clients.
 * All behavior must be deterministic, and not change across versions of the app/library.
 *
 * These policies include the data encoding, change encoding, change rebase and change application.
 *
 * @privateRemarks
 * Using a class gets stronger (nominal) typing for objects which will be down cast.
 */
export class FlexFieldKind<
	// TODO: stronger typing
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	TEditor extends FieldEditor<any> = FieldEditor<any>,
	TName extends FieldKindIdentifier = FieldKindIdentifier,
	TMultiplicity extends Multiplicity = Multiplicity,
> implements FieldKindData
{
	protected _typeCheck!: MakeNominal;

	/**
	 * Change handling policy.
	 */
	// TODO: stronger typing
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public readonly changeHandler: FieldChangeHandler<any, TEditor>;

	public constructor(
		public readonly identifier: TName,
		public readonly multiplicity: TMultiplicity,
		// TODO: stronger typing
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		private readonly options: FieldKindOptions<FieldChangeHandler<any, TEditor>>,
	) {
		this.changeHandler = options.changeHandler;
	}

	/**
	 * True if a client should be able to {@link TreeView.upgradeSchema} from a field schema using this field kind and `originalTypes` to `superset`.
	 *
	 * @privateRemarks
	 * See also {@link FieldKindOptions.allowedMonotonicUpgrade} for constraints on the implementation.
	 */
	public allowedMonotonicUpgrade(
		policy: SchemaPolicy,
		originalData: TreeStoredSchema,
		originalTypes: TreeTypeSet,
		superset: TreeFieldStoredSchema,
	): boolean {
		if (
			isNeverField(policy, originalData, {
				kind: this.identifier,
				types: originalTypes,
				// Metadata is not used for this check.
				persistedMetadata: undefined,
			})
		) {
			return true;
		}
		if (isNeverField(policy, originalData, superset)) {
			return false;
		}
		return this.options.allowedMonotonicUpgrade(originalTypes, superset);
	}
}

/**
 * Additional options for {@link FlexFieldKind}.
 *
 * @remarks
 * Puts the more confusing parameters into this object so they get explicit names to help with clarity.
 */
export interface FieldKindOptions<TFieldChangeHandler> {
	/**
	 * Change handling policy.
	 */
	readonly changeHandler: TFieldChangeHandler;

	/**
	 * True if a client should be able to {@link TreeView.upgradeSchema} from a field schema using this field kind and `originalTypes` to `superset`.
	 * @remarks
	 * Must return false if such an upgrade could violate any invariants of `superset` for any document which is compatible with `this` + `originalTypes`.
	 *
	 * Unlike the rest of the FieldKind API, this function may change over time without changing the FieldKind identifier without causing decoherence between clients.
	 * It has a different set of constraints:
	 *
	 * - This must never allow an upgrade that could violate any invariants of any field kind required by any version of client for any document content (that was not already invalid).
	 * This prevents a schema upgrade from causing a document to become out of schema.
	 * - The set of implementations of this function across all fields kinds and all client versions must never permit a cycle.
	 * This prevents applications which simply do an upgrade when possible from being able to have two clients both upgrade where one is actually a down grade and they cause an infinite loop of schema upgrade edits.
	 *
	 * To help maintain these invariants, any cases where the set of allowed contents does not increase (but is the same so the upgrade is still in schema) must be considered carefully.
	 * For example, a migration from `Sequence([])` to `Optional([])`  can be problematic despite being permissible
	 * as it does not change what content is allowed (the field must be empty either way as no types are allowed in it).
	 * Such cases, if allowed, could lead to cycles if their inverse is also allowed.
	 * These cases, if supported, can be removed, but if doing so must be documented and still considered when avoiding cycles.
	 *
	 * Used by {@link FlexFieldKind.allowedMonotonicUpgrade}, which handles the `never` cases (empty type sets) before calling this: the implementer does not need to handle those.
	 *
	 * TODO: this design is rather limiting, and there is some planned work in this area:
	 * - Provide schema upgrade schema not reliant on this to ensure monotonicity of schema upgrades like AB#7482.
	 * - This monotonic upgrade scheme can remain useful for features like AB#53604 so it should be kept and refined.
	 */
	readonly allowedMonotonicUpgrade: (
		originalTypes: TreeTypeSet,
		superset: TreeFieldStoredSchema,
	) => boolean;

	/**
	 * Kinds (in addition to this) whose edits can be processed by changeHandler.
	 * If the kind of a field changes, and edits are rebased across that kind change,
	 * listing the other old kind here can prevent those edits from being conflicted and
	 * provide a chance to handle them.
	 */
	// TODO: provide this and use it for improved support for rebasing changes across schema upgrades.
	// readonly handlesEditsFrom: ReadonlySet<FieldKindIdentifier>;
}

/**
 * Policy from the app for interpreting the stored schema.
 * The app must ensure consistency for all users of the document.
 */
export interface FullSchemaPolicy extends SchemaPolicy {
	/**
	 * Policy information about FieldKinds:
	 * This is typically stored as code, not in documents, and defines how to handles fields based on their kind.
	 * It is assumed that all users of a document will have exactly the same FieldKind policies,
	 * though older applications might be missing some,
	 * and will be unable to process any changes that use those FieldKinds.
	 */
	readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>;
}
