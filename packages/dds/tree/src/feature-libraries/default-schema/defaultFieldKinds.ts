/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ChangeAtomId,
	type DeltaDetachedNodeId,
	type DeltaFieldChanges,
	type FieldKindIdentifier,
	forbiddenFieldKindIdentifier,
	Multiplicity,
} from "../../core/index.js";
import { fail } from "../../util/index.js";
import {
	type FieldChangeDelta,
	type FieldChangeHandler,
	type FieldEditor,
	type FieldKindConfiguration,
	type FieldKindConfigurationEntry,
	FieldKindWithEditor,
	type FlexFieldKind,
	type ToDelta,
	allowsTreeSchemaIdentifierSuperset,
	referenceFreeFieldChangeRebaser,
} from "../modular-schema/index.js";
import {
	type OptionalChangeset,
	optionalChangeHandler,
	optionalFieldEditor,
} from "../optional-field/index.js";
import { sequenceFieldChangeHandler } from "../sequence-field/index.js";

import { noChangeCodecFamily } from "./noChangeCodecs.js";

/**
 * ChangeHandler that only handles no-op / identity changes.
 */
export const noChangeHandler: FieldChangeHandler<0> = {
	rebaser: referenceFreeFieldChangeRebaser({
		compose: (change1: 0, change2: 0) => 0,
		invert: (changes: 0) => 0,
		rebase: (change: 0, over: 0) => 0,
	}),
	codecsFactory: () => noChangeCodecFamily,
	editor: { buildChildChange: (index, change) => fail("Child changes not supported") },
	intoDelta: (change, deltaFromChild: ToDelta): FieldChangeDelta => ({}),
	relevantRemovedRoots: (change): Iterable<DeltaDetachedNodeId> => [],
	isEmpty: (change: 0) => true,
	getNestedChanges: (change: 0) => [],
	createEmpty: () => 0,
	getCrossFieldKeys: () => [],
};

export interface ValueFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which replaces the current value of the field with `newValue`.
	 * @param ids - The ids for the fill and detach fields.
	 */
	set(ids: { fill: ChangeAtomId; detach: ChangeAtomId }): OptionalChangeset;
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
		(other.kind === sequence.identifier || other.kind === optionalIdentifier) &&
		allowsTreeSchemaIdentifierSuperset(types, other.types),
	new Set([]),
);

export const valueFieldEditor: ValueFieldEditor = {
	...optionalFieldEditor,
	set: (ids: {
		fill: ChangeAtomId;
		detach: ChangeAtomId;
	}): OptionalChangeset => optionalFieldEditor.set(false, ids),
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
		(other.kind === sequence.identifier ||
			other.kind === requiredIdentifier ||
			other.kind === optional.identifier ||
			other.kind === nodeKey.identifier) &&
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
		other.kind === sequenceIdentifier &&
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
		(other.kind === sequence.identifier ||
			other.kind === requiredIdentifier ||
			other.kind === optional.identifier ||
			other.kind === nodeKeyIdentifier) &&
		allowsTreeSchemaIdentifierSuperset(types, other.types),
	new Set(),
);

const identifierFieldIdentifier = "Identifier";

/**
 * Exactly one identifier.
 */
export const identifier = new FieldKindWithEditor(
	identifierFieldIdentifier,
	Multiplicity.Single,
	noChangeHandler,
	(types, other) =>
		(other.kind === sequence.identifier ||
			other.kind === requiredIdentifier ||
			other.kind === optional.identifier ||
			other.kind === identifierFieldIdentifier) &&
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
	(types, other) => fieldKinds.get(other.kind)?.multiplicity !== Multiplicity.Single,
	new Set(),
);

export const fieldKindConfigurations: ReadonlyMap<number, FieldKindConfiguration> = new Map([
	[
		1,
		new Map<FieldKindIdentifier, FieldKindConfigurationEntry>([
			[nodeKey.identifier, { kind: nodeKey, formatVersion: 1 }],
			[required.identifier, { kind: required, formatVersion: 1 }],
			[optional.identifier, { kind: optional, formatVersion: 1 }],
			[sequence.identifier, { kind: sequence, formatVersion: 1 }],
			[forbidden.identifier, { kind: forbidden, formatVersion: 1 }],
			[identifier.identifier, { kind: identifier, formatVersion: 1 }],
		]),
	],
	[
		2,
		new Map<FieldKindIdentifier, FieldKindConfigurationEntry>([
			[nodeKey.identifier, { kind: nodeKey, formatVersion: 1 }],
			[required.identifier, { kind: required, formatVersion: 2 }],
			[optional.identifier, { kind: optional, formatVersion: 2 }],
			[sequence.identifier, { kind: sequence, formatVersion: 1 }],
			[forbidden.identifier, { kind: forbidden, formatVersion: 1 }],
			[identifier.identifier, { kind: identifier, formatVersion: 1 }],
		]),
	],
	[
		3,
		new Map<FieldKindIdentifier, FieldKindConfigurationEntry>([
			[nodeKey.identifier, { kind: nodeKey, formatVersion: 1 }],
			[required.identifier, { kind: required, formatVersion: 2 }],
			[optional.identifier, { kind: optional, formatVersion: 2 }],
			[sequence.identifier, { kind: sequence, formatVersion: 2 }],
			[forbidden.identifier, { kind: forbidden, formatVersion: 1 }],
			[identifier.identifier, { kind: identifier, formatVersion: 1 }],
		]),
	],
	[
		4,
		new Map<FieldKindIdentifier, FieldKindConfigurationEntry>([
			[nodeKey.identifier, { kind: nodeKey, formatVersion: 1 }],
			[required.identifier, { kind: required, formatVersion: 2 }],
			[optional.identifier, { kind: optional, formatVersion: 2 }],
			[sequence.identifier, { kind: sequence, formatVersion: 3 }],
			[forbidden.identifier, { kind: forbidden, formatVersion: 1 }],
			[identifier.identifier, { kind: identifier, formatVersion: 1 }],
		]),
	],
]);

/**
 * All supported field kinds.
 *
 * @privateRemarks
 * Before making a SharedTree format change which impacts which set of field kinds are allowed,
 * code which uses this should be audited for compatibility considerations.
 */
export const fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor> = new Map(
	[required, optional, sequence, nodeKey, identifier, forbidden].map((s) => [s.identifier, s]),
);

// Create named Aliases for nicer intellisense.

// TODO: Find a way to make docs like {@inheritDoc required} work in vscode.
// TODO: ensure thy work in generated docs.
// TODO: add these comments to the rest of the cases below.
/**
 */
export interface Required extends FlexFieldKind<"Value", Multiplicity.Single> {}
/**
 */
export interface Optional extends FlexFieldKind<"Optional", Multiplicity.Optional> {}
/**
 */
export interface Sequence extends FlexFieldKind<"Sequence", Multiplicity.Sequence> {}
/**
 */
export interface Identifier extends FlexFieldKind<"Identifier", Multiplicity.Single> {}
/**
 */
export interface Forbidden
	extends FlexFieldKind<typeof forbiddenFieldKindIdentifier, Multiplicity.Forbidden> {}

/**
 * Default FieldKinds with their editor types erased.
 */
export const FieldKinds: {
	// TODO: inheritDoc for these somehow
	readonly required: Required;
	readonly optional: Optional;
	readonly sequence: Sequence;
	readonly identifier: Identifier;
	readonly forbidden: Forbidden;
} = { required, optional, sequence, identifier, forbidden };
