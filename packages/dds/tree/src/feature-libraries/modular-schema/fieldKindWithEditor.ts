/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type {
	FieldKindIdentifier,
	TreeFieldStoredSchema,
	TreeStoredSchema,
	TreeTypeSet,
	Multiplicity,
} from "../../core/index.js";

import type { FieldChangeHandler, FieldEditor } from "./fieldChangeHandler.js";
import { FlexFieldKind, type FullSchemaPolicy } from "./fieldKind.js";
import { isNeverField } from "./isNeverTree.js";

// TODO: stronger typing
/* eslint-disable @typescript-eslint/no-explicit-any */

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
 */
export class FieldKindWithEditor<
	TEditor extends FieldEditor<any> = FieldEditor<any>,
	TMultiplicity extends Multiplicity = Multiplicity,
	TName extends string = string,
> extends FlexFieldKind<TName, TMultiplicity> {
	/**
	 * @param identifier - Globally scoped identifier.
	 * @param multiplicity - bound on the number of children that fields of this kind may have.
	 * TODO: replace with numeric upper and lower bounds.
	 * @param changeHandler - Change handling policy.
	 * @param allowsTreeSupersetOf - returns true iff `superset` supports all that this does
	 * and `superset` is an allowed upgrade. Does not have to handle the `never` cases.
	 * See {@link isNeverField}.
	 * TODO: when used as a method (instead of a free function like the other superset related functions),
	 * this name is/signature is confusing and seems backwards.
	 * @param handlesEditsFrom - Kinds (in addition to this) whose edits can be processed by changeHandler.
	 * If the kind of a field changes, and edits are rebased across that kind change,
	 * listing the other old kind here can prevent those edits from being conflicted and
	 * provide a chance to handle them.
	 */
	public constructor(
		identifier: TName,
		multiplicity: TMultiplicity,
		public readonly changeHandler: FieldChangeHandler<any, TEditor>,
		private readonly allowsTreeSupersetOf: (
			originalTypes: TreeTypeSet,
			superset: TreeFieldStoredSchema,
		) => boolean,
		public readonly handlesEditsFrom: ReadonlySet<FieldKindIdentifier>,
	) {
		super(identifier as TName & FieldKindIdentifier, multiplicity);
	}

	/**
	 * @returns true iff `superset` permits a (non-strict) superset of the subtrees
	 * allowed by field made from `this` and `originalTypes`.
	 */
	public allowsFieldSuperset(
		policy: FullSchemaPolicy,
		originalData: TreeStoredSchema,
		originalTypes: TreeTypeSet,
		superset: TreeFieldStoredSchema,
	): boolean {
		if (
			isNeverField(policy, originalData, {
				kind: this.identifier,
				types: originalTypes,
				// Metadata is not used for this check.
				metadata: undefined,
			})
		) {
			return true;
		}
		if (isNeverField(policy, originalData, superset)) {
			return false;
		}
		return this.allowsTreeSupersetOf(originalTypes, superset);
	}
}

/**
 * Downcasts to {@link FieldKindWithEditor}.
 */
export function withEditor<
	TName extends string = string,
	TMultiplicity extends Multiplicity = Multiplicity,
>(
	kind: FlexFieldKind<TName, TMultiplicity>,
): FieldKindWithEditor<FieldEditor<any>, TMultiplicity, TName> {
	assert(kind instanceof FieldKindWithEditor, 0x7b5 /* kind must be FieldKindWithEditor */);
	return kind as FieldKindWithEditor<FieldEditor<any>, TMultiplicity, TName>;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
