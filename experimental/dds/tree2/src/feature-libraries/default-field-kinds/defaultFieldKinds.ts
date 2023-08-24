/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKindIdentifier,
	Delta,
	ITreeCursor,
	forbiddenFieldKindIdentifier,
	ChangesetLocalId,
} from "../../core";
import { fail } from "../../util";
import {
	FieldKind,
	Multiplicity,
	allowsTreeSchemaIdentifierSuperset,
	ToDelta,
	FieldChangeHandler,
	FieldEditor,
	referenceFreeFieldChangeRebaser,
	BrandedFieldKind,
	brandedFieldKind,
} from "../modular-schema";
import { sequenceFieldChangeHandler, SequenceFieldEditor } from "../sequence-field";
import { noChangeCodecFamily } from "./defaultFieldChangeCodecs";
import { OptionalChangeset } from "./defaultFieldChangeTypes";
import { OptionalFieldEditor, optionalChangeHandler, optionalFieldEditor } from "./optionalField";

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
	intoDelta: (change: 0, deltaFromChild: ToDelta): Delta.MarkList => [],
	isEmpty: (change: 0) => true,
};

export interface ValueFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which replaces the current value of the field with `newValue`.
	 */
	set(newValue: ITreeCursor, id: ChangesetLocalId): OptionalChangeset;
}

/**
 * 0 or 1 items.
 */
export const optional: BrandedFieldKind<"Optional", Multiplicity.Optional, OptionalFieldEditor> =
	brandedFieldKind(
		"Optional",
		Multiplicity.Optional,
		optionalChangeHandler,
		(types, other) =>
			(other.kind.identifier === sequence.identifier ||
				other.kind.identifier === optional.identifier) &&
			allowsTreeSchemaIdentifierSuperset(types, other.types),
		new Set([]),
	);

export const valueFieldEditor: ValueFieldEditor = {
	...optionalFieldEditor,
	set: (newContent: ITreeCursor, id: ChangesetLocalId): OptionalChangeset =>
		optionalFieldEditor.set(newContent, false, id),
};

export const valueChangeHandler: FieldChangeHandler<OptionalChangeset, ValueFieldEditor> = {
	...optional.changeHandler,
	editor: valueFieldEditor,
};

/**
 * Exactly one item.
 */
export const value: BrandedFieldKind<"Value", Multiplicity.Value, ValueFieldEditor> =
	brandedFieldKind(
		"Value",
		Multiplicity.Value,
		valueChangeHandler,
		(types, other) =>
			(other.kind.identifier === sequence.identifier ||
				other.kind.identifier === value.identifier ||
				other.kind.identifier === optional.identifier ||
				other.kind.identifier === nodeKey.identifier) &&
			allowsTreeSchemaIdentifierSuperset(types, other.types),
		new Set(),
	);

/**
 * 0 or more items.
 */
export const sequence: BrandedFieldKind<"Sequence", Multiplicity.Sequence, SequenceFieldEditor> =
	brandedFieldKind(
		"Sequence",
		Multiplicity.Sequence,
		sequenceFieldChangeHandler,
		(types, other) =>
			other.kind.identifier === sequence.identifier &&
			allowsTreeSchemaIdentifierSuperset(types, other.types),
		// TODO: add normalizer/importers for handling ops from other kinds.
		new Set([]),
	);

/**
 * Exactly one identifier.
 */
export const nodeKey: BrandedFieldKind<
	"NodeKey",
	Multiplicity.Value,
	FieldEditor<0>
> = brandedFieldKind(
	"NodeKey",
	Multiplicity.Value,
	noChangeHandler,
	(types, other) =>
		(other.kind.identifier === sequence.identifier ||
			other.kind.identifier === value.identifier ||
			other.kind.identifier === optional.identifier ||
			other.kind.identifier === nodeKey.identifier) &&
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
export const forbidden = brandedFieldKind(
	forbiddenFieldKindIdentifier,
	Multiplicity.Forbidden,
	noChangeHandler,
	// All multiplicities other than Value support empty.
	(types, other) => fieldKinds.get(other.kind.identifier)?.multiplicity !== Multiplicity.Value,
	new Set(),
);

/**
 * Default field kinds by identifier
 */
export const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind> = new Map(
	[value, optional, sequence, nodeKey, forbidden].map((s) => [s.identifier, s]),
);

// Create named Aliases for nicer intellisense.

// TODO: Find a way to make docs like {@inheritDoc value} work in vscode.
// TODO: ensure thy work in generated docs.
// TODO: add these comments to the rest of the cases below.
/**
 * @alpha
 */
export interface ValueFieldKind
	extends BrandedFieldKind<"Value", Multiplicity.Value, FieldEditor<any>> {}
/**
 * @alpha
 */
export interface Optional
	extends BrandedFieldKind<"Optional", Multiplicity.Optional, FieldEditor<any>> {}
/**
 * @alpha
 */
export interface Sequence
	extends BrandedFieldKind<"Sequence", Multiplicity.Sequence, FieldEditor<any>> {}
/**
 * @alpha
 */
export interface NodeKeyFieldKind
	extends BrandedFieldKind<"NodeKey", Multiplicity.Value, FieldEditor<any>> {}
/**
 * @alpha
 */
export interface Forbidden
	extends BrandedFieldKind<
		typeof forbiddenFieldKindIdentifier,
		Multiplicity.Forbidden,
		FieldEditor<any>
	> {}

/**
 * Default FieldKinds with their editor types erased.
 * @alpha
 */
export const FieldKinds: {
	// TODO: inheritDoc for these somehow
	readonly value: ValueFieldKind;
	readonly optional: Optional;
	readonly sequence: Sequence;
	readonly nodeKey: NodeKeyFieldKind;
	readonly forbidden: Forbidden;
} = { value, optional, sequence, nodeKey, forbidden };

/**
 * @alpha
 */
export type FieldKindTypes = typeof FieldKinds[keyof typeof FieldKinds];
