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
	 * Returns true if and only if `superset` permits a (non-strict) superset of the subtrees
	 * allowed by field made from `this` and `originalTypes`.
	 *
	 * TODO: clarify the relationship between this and FieldKindData, and issues with cyclic schema upgrades.
	 */
	public allowsFieldSuperset(
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
		return this.options.allowsTreeSupersetOf(originalTypes, superset);
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
	 * Returns true if and only if `superset` permits a (non-strict) superset of the subtrees
	 * allowed by field made from `this` and `originalTypes`.
	 * @remarks
	 * Used by {@link FlexFieldKind.allowsFieldSuperset}, which handles the `never` cases before calling this.
	 */
	readonly allowsTreeSupersetOf: (
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
