/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKindIdentifier,
	forbiddenFieldKindIdentifier,
	ChangesetLocalId,
	DeltaDetachedNodeId,
	DeltaFieldChanges,
} from "../../core";
import { fail } from "../../util";
import {
	FieldKind,
	allowsTreeSchemaIdentifierSuperset,
	ToDelta,
	FieldChangeHandler,
	FieldEditor,
	referenceFreeFieldChangeRebaser,
	FieldKindWithEditor,
} from "../modular-schema";
import { sequenceFieldChangeHandler } from "../sequence-field";
import {
	noChangeCodecFamily,
	OptionalChangeset,
	optionalChangeHandler,
	optionalFieldEditor,
} from "../optional-field";
import { Multiplicity } from "../multiplicity";

/**
 * ChangeHandler that only handles no-op / identity changes.
 */
export const noChangeHandler: FieldChangeHandler<0> = {
	rebaser: referenceFreeFieldChangeRebaser({
		compose: (changes: 0[]) => 0,
		invert: (changes: 0) => 0,
		rebase: (change: 0, over: 0) => 0,
	}),
	codecsFactory: () => noChangeCodecFamily,
	editor: { buildChildChange: (index, change) => fail("Child changes not supported") },
	intoDelta: (change, deltaFromChild: ToDelta): DeltaFieldChanges => ({}),
	relevantRemovedRoots: (change): Iterable<DeltaDetachedNodeId> => [],
	isEmpty: (change: 0) => true,
};

export interface ValueFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which replaces the current value of the field with `newValue`.
	 * @param newContent - the new content for the field
	 * @param changeId - the ID associated with the replacement of the current content.
	 * @param buildId - the ID associated with the creation of the `newContent`.
	 */
	set(ids: { fill: ChangesetLocalId; detach: ChangesetLocalId }): OptionalChangeset;
}

const optionalIdentifier = "Optional";
/**
 * 0 or 1 items.
 */
export const optional = new FieldKindWithEditor(
	optionalIdentifier,
	Multiplicity.Optional,
	optionalChangeHandler,
	(types, other) =>
		(other.kind.identifier === sequence.identifier ||
			other.kind.identifier === optionalIdentifier) &&
		allowsTreeSchemaIdentifierSuperset(types, other.types),
	new Set([]),
);

export const valueFieldEditor: ValueFieldEditor = {
	...optionalFieldEditor,
	set: (ids: { fill: ChangesetLocalId; detach: ChangesetLocalId }): OptionalChangeset =>
		optionalFieldEditor.set(false, ids),
};

export const valueChangeHandler: FieldChangeHandler<OptionalChangeset, ValueFieldEditor> = {
	...optional.changeHandler,
	editor: valueFieldEditor,
};

const requiredIdentifier = "Value";

/**
 * Exactly one item.
 */
export const required = new FieldKindWithEditor(
	requiredIdentifier,
	Multiplicity.Single,
	valueChangeHandler,
	(types, other) =>
		(other.kind.identifier === sequence.identifier ||
			other.kind.identifier === requiredIdentifier ||
			other.kind.identifier === optional.identifier ||
			other.kind.identifier === nodeKey.identifier) &&
		allowsTreeSchemaIdentifierSuperset(types, other.types),
	new Set(),
);

const sequenceIdentifier = "Sequence";

/**
 * 0 or more items.
 */
export const sequence = new FieldKindWithEditor(
	sequenceIdentifier,
	Multiplicity.Sequence,
	sequenceFieldChangeHandler,
	(types, other) =>
		other.kind.identifier === sequenceIdentifier &&
		allowsTreeSchemaIdentifierSuperset(types, other.types),
	// TODO: add normalizer/importers for handling ops from other kinds.
	new Set([]),
);

const nodeKeyIdentifier = "NodeKey";

/**
 * Exactly one identifier.
 */
export const nodeKey = new FieldKindWithEditor(
	nodeKeyIdentifier,
	Multiplicity.Single,
	noChangeHandler,
	(types, other) =>
		(other.kind.identifier === sequence.identifier ||
			other.kind.identifier === requiredIdentifier ||
			other.kind.identifier === optional.identifier ||
			other.kind.identifier === nodeKeyIdentifier) &&
		allowsTreeSchemaIdentifierSuperset(types, other.types),
	new Set(),
);

/**
 * Exactly 0 items.
 *
 * Using Forbidden makes what types are listed for allowed in a field irrelevant
 * since the field will never have values in it.
 *
 * Using Forbidden is equivalent to picking a kind that permits empty (like sequence or optional)
 * and having no allowed types (or only never types).
 * Because of this, its possible to express everything constraint wise without Forbidden,
 * but using Forbidden can be more semantically clear than optional with no allowed types.
 *
 * For view schema, this can be useful if you need to:
 * - run a specific out of schema handler when a field is present,
 * but otherwise are ignoring or tolerating (ex: via extra fields) unmentioned fields.
 * - prevent a specific field from being used as an extra field
 * (perhaps for some past of future compatibility reason)
 * - keep a field in a schema for metadata purposes
 * (ex: for improved error messaging, error handling or documentation)
 * that is not used in this specific version of the schema (ex: to document what it was or will be used for).
 *
 * For stored schema, this can be useful if you need to:
 * - have a field which can have its schema updated to Optional or Sequence of any type.
 * - to exclude a field from extra fields
 * - for the schema system to use as a default for fields which aren't declared
 * (ex: when updating a field that did not exist into one that does)
 *
 * See {@link emptyField} for a constant, reusable field using Forbidden.
 */
export const forbidden = new FieldKindWithEditor(
	forbiddenFieldKindIdentifier,
	Multiplicity.Forbidden,
	noChangeHandler,
	// All multiplicities other than Value support empty.
	(types, other) => fieldKinds.get(other.kind.identifier)?.multiplicity !== Multiplicity.Single,
	new Set(),
);

/**
 * Default field kinds by identifier
 */
export const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor> = new Map(
	[required, optional, sequence, nodeKey, forbidden].map((s) => [s.identifier, s]),
);

// Create named Aliases for nicer intellisense.

// TODO: Find a way to make docs like {@inheritDoc required} work in vscode.
// TODO: ensure thy work in generated docs.
// TODO: add these comments to the rest of the cases below.
/**
 * @alpha
 */
export interface Required extends FieldKind<"Value", Multiplicity.Single> {}
/**
 * @alpha
 */
export interface Optional extends FieldKind<"Optional", Multiplicity.Optional> {}
/**
 * @alpha
 */
export interface Sequence extends FieldKind<"Sequence", Multiplicity.Sequence> {}
/**
 * @alpha
 */
export interface NodeKeyFieldKind extends FieldKind<"NodeKey", Multiplicity.Single> {}
/**
 * @alpha
 */
export interface Forbidden
	extends FieldKind<typeof forbiddenFieldKindIdentifier, Multiplicity.Forbidden> {}

/**
 * Default FieldKinds with their editor types erased.
 * @alpha
 */
export const FieldKinds: {
	// TODO: inheritDoc for these somehow
	readonly required: Required;
	readonly optional: Optional;
	readonly sequence: Sequence;
	readonly nodeKey: NodeKeyFieldKind;
	readonly forbidden: Forbidden;
} = { required, optional, sequence, nodeKey, forbidden };
