/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";

import {
	type ChangeAtomId,
	type DeltaDetachedNodeId,
	type FieldKindIdentifier,
	forbiddenFieldKindIdentifier,
	Multiplicity,
} from "../../core/index.js";
import {
	type FieldChangeDelta,
	type FieldChangeHandler,
	type FieldEditor,
	type FieldKindConfiguration,
	type FieldKindConfigurationEntry,
	FlexFieldKind,
	type FullSchemaPolicy,
	type ToDelta,
	referenceFreeFieldChangeRebaser,
} from "../modular-schema/index.js";
import {
	type OptionalChangeset,
	type OptionalFieldEditor,
	optionalChangeHandler,
	optionalFieldEditor,
} from "../optional-field/index.js";
import {
	sequenceFieldChangeHandler,
	type SequenceFieldEditor,
} from "../sequence-field/index.js";

import { noChangeCodecFamily } from "./noChangeCodecs.js";
import type { CodecTree } from "../../codec/index.js";
import { brand, brandConst, type Brand } from "../../util/index.js";

/**
 * ChangeHandler that only handles no-op / identity changes.
 */
export const noChangeHandler: FieldChangeHandler<0> = {
	rebaser: referenceFreeFieldChangeRebaser({
		compose: (change1: 0, change2: 0) => 0,
		invert: (changes: 0) => 0,
		rebase: (change: 0, over: 0) => 0,
		mute: (changes: 0) => 0,
	}),
	codecsFactory: () => noChangeCodecFamily,
	editor: { buildChildChanges: () => fail(0xb0d /* Child changes not supported */) },
	intoDelta: (change, deltaFromChild: ToDelta): FieldChangeDelta => ({}),
	relevantRemovedRoots: (change): Iterable<DeltaDetachedNodeId> => [],
	isEmpty: (change: 0) => true,
	getNestedChanges: (change: 0) => [],
	createEmpty: () => 0,
	getCrossFieldKeys: () => [],
};

/**
 * {@link FieldEditor} for required fields (always contain exactly 1 child).
 * @remarks
 * This shares code with optional fields, since they are the same edit wise except setting to empty is not allowed,
 * and the content is always assumed to not be empty.
 * This means the actual edits implemented for optional fields are sufficient to support required fields
 * which is why this is defined and implemented in terms of optional fields.
 */
export interface RequiredFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which replaces the current value of the field with `newValue`.
	 * @param ids - The ids for the fill and detach fields.
	 */
	set(ids: { fill: ChangeAtomId; detach: ChangeAtomId }): OptionalChangeset;
}

const optionalIdentifier = brandConst("Optional")<FieldKindIdentifier>();
const requiredIdentifier = brandConst("Value")<FieldKindIdentifier>();
const sequenceIdentifier = brandConst("Sequence")<FieldKindIdentifier>();
const identifierFieldIdentifier = brandConst("Identifier")<FieldKindIdentifier>();

/**
 * 0 or 1 items.
 */
export const optional = new FlexFieldKind(optionalIdentifier, Multiplicity.Optional, {
	changeHandler: optionalChangeHandler,
	allowMonotonicUpgradeFrom: new Set([
		identifierFieldIdentifier,
		requiredIdentifier,
		forbiddenFieldKindIdentifier,
	]),
});

export const requiredFieldEditor: RequiredFieldEditor = {
	...optionalFieldEditor,
	set: (ids: {
		fill: ChangeAtomId;
		detach: ChangeAtomId;
	}): OptionalChangeset => optionalFieldEditor.set(false, ids),
};

export const requiredFieldChangeHandler: FieldChangeHandler<
	OptionalChangeset,
	RequiredFieldEditor
> = {
	...optionalChangeHandler,
	editor: requiredFieldEditor,
};

/**
 * Exactly one item.
 */
export const required = new FlexFieldKind(requiredIdentifier, Multiplicity.Single, {
	changeHandler: requiredFieldChangeHandler,
	allowMonotonicUpgradeFrom: new Set([identifierFieldIdentifier]),
});

/**
 * 0 or more items.
 */
export const sequence = new FlexFieldKind(sequenceIdentifier, Multiplicity.Sequence, {
	changeHandler: sequenceFieldChangeHandler,
	allowMonotonicUpgradeFrom: new Set([
		required.identifier,
		optional.identifier,
		identifierFieldIdentifier,
		forbiddenFieldKindIdentifier,
	]),
});

/**
 * Exactly one identifier.
 */
export const identifier = new FlexFieldKind(identifierFieldIdentifier, Multiplicity.Single, {
	changeHandler: noChangeHandler,
	// By omitting required here,
	// this is making a policy choice that a schema upgrade cannot be done from required to identifier.
	// Since an identifier can be upgraded into a required field,
	// preventing the inverse helps ensure that schema upgrades are monotonic.
	// Which direction is allowed is a subjective policy choice.
	allowMonotonicUpgradeFrom: new Set([]),
});

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
export const forbidden = new FlexFieldKind(
	forbiddenFieldKindIdentifier,
	Multiplicity.Forbidden,
	{
		changeHandler: noChangeHandler,
		allowMonotonicUpgradeFrom: new Set(),
	},
);

export const fieldKindConfigurations: ReadonlyMap<
	ModularChangeFormatVersion,
	FieldKindConfiguration
> = new Map([
	[
		brand(3),
		new Map<FieldKindIdentifier, FieldKindConfigurationEntry>([
			[required.identifier, { kind: required, formatVersion: 2 }],
			[optional.identifier, { kind: optional, formatVersion: 2 }],
			[sequence.identifier, { kind: sequence, formatVersion: 2 }],
			[forbidden.identifier, { kind: forbidden, formatVersion: 1 }],
			[identifier.identifier, { kind: identifier, formatVersion: 1 }],
		]),
	],
	[
		brand(4),
		new Map<FieldKindIdentifier, FieldKindConfigurationEntry>([
			[required.identifier, { kind: required, formatVersion: 2 }],
			[optional.identifier, { kind: optional, formatVersion: 2 }],
			[sequence.identifier, { kind: sequence, formatVersion: 3 }],
			[forbidden.identifier, { kind: forbidden, formatVersion: 1 }],
			[identifier.identifier, { kind: identifier, formatVersion: 1 }],
		]),
	],
]);

export type ModularChangeFormatVersion = Brand<3 | 4, "ModularChangeFormatVersion">;
export function getCodecTreeForModularChangeFormat(
	version: ModularChangeFormatVersion,
): CodecTree {
	const dependencies =
		fieldKindConfigurations.get(version) ?? fail(0xc7c /* Unknown modular change format */);
	const children: CodecTree[] = Array.from(dependencies.entries()).map(
		([key, { formatVersion }]) => ({
			name: `FieldKind:${key}`,
			version: formatVersion,
		}),
	);
	return {
		name: "ModularChange",
		version,
		children,
	};
}

/**
 * All supported field kinds.
 *
 * @privateRemarks
 * Before making a SharedTree format change which impacts which set of field kinds are allowed,
 * code which uses this should be audited for compatibility considerations.
 */
export const fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind> = new Map(
	[required, optional, sequence, identifier, forbidden].map((s) => [s.identifier, s]),
);

// Create named Aliases for nicer intellisense.

// TODO: Find a way to make docs like {@inheritDoc required} work in vscode.
// TODO: ensure thy work in generated docs.
// TODO: add these comments to the rest of the cases below.
export interface Required
	extends FlexFieldKind<RequiredFieldEditor, typeof requiredIdentifier, Multiplicity.Single> {}
export interface Optional
	extends FlexFieldKind<
		OptionalFieldEditor,
		typeof optionalIdentifier,
		Multiplicity.Optional
	> {}
export interface Sequence
	extends FlexFieldKind<
		SequenceFieldEditor,
		typeof sequenceIdentifier,
		Multiplicity.Sequence
	> {}
export interface Identifier
	extends FlexFieldKind<
		FieldEditor<0>,
		typeof identifierFieldIdentifier,
		Multiplicity.Single
	> {}
export interface Forbidden
	extends FlexFieldKind<
		FieldEditor<0>,
		typeof forbiddenFieldKindIdentifier,
		Multiplicity.Forbidden
	> {}

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

/**
 * FullSchemaPolicy with the default field kinds.
 */
export const defaultSchemaPolicy: FullSchemaPolicy = {
	fieldKinds,
};
