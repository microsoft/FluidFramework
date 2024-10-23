/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FieldKindIdentifier,
	FieldKindData,
	Multiplicity,
	SchemaPolicy,
} from "../../core/index.js";

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
 * @sealed * @privateRemarks
 * This being @sealed is for users of this package.
 * This package itself may provide implementations.
 * This pattern was picked instead of an interface since we do not have a convention for how to mark interfaces as only allowed to be implemented by the package declaring them,
 * and using a class also gets stronger (nominal) typing for objects which will be down cast.
 */
export abstract class FlexFieldKind<
	TName extends string = string,
	TMultiplicity extends Multiplicity = Multiplicity,
> implements FieldKindData
{
	/**
	 * @param identifier - Globally scoped identifier.
	 * @param multiplicity - bound on the number of children that fields of this kind may have.
	 * TODO: consider replacing with numeric upper and lower bounds.
	 */
	protected constructor(
		public readonly identifier: TName & FieldKindIdentifier,
		public readonly multiplicity: TMultiplicity,
	) {}
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
