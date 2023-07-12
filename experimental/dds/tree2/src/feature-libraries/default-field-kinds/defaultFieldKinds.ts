/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	FieldKindIdentifier,
	Delta,
	ITreeCursor,
	TaggedChange,
	ITreeCursorSynchronous,
	tagChange,
	FieldStoredSchema,
	TreeTypeSet,
} from "../../core";
import { brand, fail, Mutable } from "../../util";
import { singleTextCursor, jsonableTreeFromCursor } from "../treeTextCursor";
import {
	FieldKind,
	Multiplicity,
	allowsTreeSchemaIdentifierSuperset,
	ToDelta,
	FieldChangeRebaser,
	FieldChangeHandler,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangeset,
	FieldEditor,
	referenceFreeFieldChangeRebaser,
	NodeReviver,
	IdAllocator,
	CrossFieldManager,
	RevisionMetadataSource,
	getIntention,
	NodeExistenceState,
	ChangesetLocalId,
} from "../modular-schema";
import { sequenceFieldChangeHandler, SequenceFieldEditor } from "../sequence-field";
import { populateChildModifications } from "../deltaUtils";
import { makeOptionalFieldCodecFamily, noChangeCodecFamily } from "./defaultFieldChangeCodecs";
import { OptionalChangeset, OptionalFieldChange } from "./defaultFieldChangeTypes";

/**
 * @alpha
 */
export type BrandedFieldKind<
	TName extends string,
	TMultiplicity extends Multiplicity,
	TEditor extends FieldEditor<any>,
> = FieldKind<TEditor, TMultiplicity> & {
	identifier: TName & FieldKindIdentifier;
};

function brandedFieldKind<
	TName extends string,
	TMultiplicity extends Multiplicity,
	TEditor extends FieldEditor<any>,
>(
	identifier: TName,
	multiplicity: TMultiplicity,
	changeHandler: FieldChangeHandler<any, TEditor>,
	allowsTreeSupersetOf: (originalTypes: TreeTypeSet, superset: FieldStoredSchema) => boolean,
	handlesEditsFrom: ReadonlySet<FieldKindIdentifier>,
): BrandedFieldKind<TName, TMultiplicity, TEditor> {
	return new FieldKind<TEditor, TMultiplicity>(
		brand(identifier),
		multiplicity,
		changeHandler,
		allowsTreeSupersetOf,
		handlesEditsFrom,
	) as BrandedFieldKind<TName, TMultiplicity, TEditor>;
}

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

const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
	compose: (
		changes: TaggedChange<OptionalChangeset>[],
		composeChild: NodeChangeComposer,
	): OptionalChangeset => {
		let fieldChange: Mutable<OptionalFieldChange> | undefined;
		const origNodeChange: TaggedChange<NodeChangeset>[] = [];
		const newNodeChanges: TaggedChange<NodeChangeset>[] = [];
		for (const { change, revision } of changes) {
			if (change.deletedBy === undefined && change.childChange !== undefined) {
				const taggedChange = tagChange(change.childChange, revision);
				if (fieldChange === undefined) {
					origNodeChange.push(taggedChange);
				} else {
					newNodeChanges.push(taggedChange);
				}
			}

			if (change.fieldChange !== undefined) {
				if (fieldChange === undefined) {
					fieldChange = {
						id: change.fieldChange.id,
						revision: change.fieldChange.revision ?? revision,
						wasEmpty: change.fieldChange.wasEmpty,
					};
				} else {
					fieldChange.id = change.fieldChange.id;
					fieldChange.revision = change.fieldChange.revision ?? revision;
				}

				if (change.fieldChange.newContent !== undefined) {
					fieldChange.newContent = { ...change.fieldChange.newContent };
				} else {
					delete fieldChange.newContent;
				}

				// The previous changes applied to a different value, so we discard them.
				// TODO: Represent muted changes
				newNodeChanges.length = 0;

				if (change.fieldChange.newContent?.changes !== undefined) {
					newNodeChanges.push(tagChange(change.fieldChange.newContent.changes, revision));
				}
			}
		}

		const composed: OptionalChangeset = {};
		if (fieldChange !== undefined) {
			if (newNodeChanges.length > 0) {
				assert(
					fieldChange.newContent !== undefined,
					0x5c4 /* Shouldn't have new node changes if there is no new node */,
				);
				fieldChange.newContent.changes = composeChild(newNodeChanges);
			}
			composed.fieldChange = fieldChange;
		}

		if (origNodeChange.length > 0) {
			composed.childChange = composeChild(origNodeChange);
		}

		return composed;
	},

	amendCompose: () => fail("Not implemented"),

	invert: (
		{ revision, change }: TaggedChange<OptionalChangeset>,
		invertChild: NodeChangeInverter,
		reviver: NodeReviver,
	): OptionalChangeset => {
		const inverse: OptionalChangeset = {};

		const fieldChange = change.fieldChange;
		if (fieldChange !== undefined) {
			inverse.fieldChange = {
				id: fieldChange.id,
				wasEmpty: fieldChange.newContent === undefined,
			};
			if (fieldChange.newContent?.changes !== undefined) {
				// The node inserted by change will be the node deleted by inverse
				// Move the inverted changes to the child change field
				inverse.childChange = invertChild(fieldChange.newContent.changes, 0);
			}

			if (!fieldChange.wasEmpty) {
				assert(revision !== undefined, 0x592 /* Unable to revert to undefined revision */);
				inverse.fieldChange.newContent = {
					revert: reviver(revision, 0, 1)[0],
					changeId: { revision, localId: fieldChange.id },
				};
				if (change.childChange !== undefined) {
					if (change.deletedBy === undefined) {
						inverse.fieldChange.newContent.changes = invertChild(change.childChange, 0);
					} else {
						// We currently drop the muted changes in the inverse.
						// TODO: produce muted inverse changes so that a retroactive undo of revision
						// `change.deletedBy` would be able to pick up and unmute those changes.
					}
				}
			}
		} else {
			if (change.childChange !== undefined && change.deletedBy === undefined) {
				inverse.childChange = invertChild(change.childChange, 0);
			} else {
				// Drop the muted changes if deletedBy is set to avoid
				// applying muted changes on undo
			}
		}

		return inverse;
	},

	amendInvert: () => fail("Not implemented"),

	rebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): OptionalChangeset => {
		const over = overTagged.change;
		if (change.fieldChange !== undefined) {
			if (over.fieldChange !== undefined) {
				const wasEmpty = over.fieldChange.newContent === undefined;

				// TODO: Handle rebasing child changes over `over.childChange`.
				return {
					...change,
					fieldChange: { ...change.fieldChange, wasEmpty },
				};
			}

			const rebasedChange = { ...change };
			const overChildChange =
				change.deletedBy === over.deletedBy ? over.childChange : undefined;
			const rebasedChildChange = rebaseChild(change.childChange, overChildChange);
			if (rebasedChildChange !== undefined) {
				rebasedChange.childChange = rebasedChildChange;
			} else {
				delete rebasedChange.childChange;
			}

			return rebasedChange;
		}

		if (change.childChange !== undefined) {
			if (over.fieldChange !== undefined) {
				const overIntention = getIntention(
					over.fieldChange.revision ?? overTagged.revision,
					revisionMetadata,
				);
				if (change.deletedBy === undefined) {
					// `change.childChange` refers to the node being deleted by `over`.
					return {
						childChange: rebaseChild(
							change.childChange,
							over.deletedBy === undefined ? undefined : over.childChange,
							NodeExistenceState.Dead,
						),
						deletedBy: {
							revision: overIntention,
							localId: over.fieldChange.id,
						},
					};
				} else if (over.fieldChange.newContent !== undefined) {
					const overContent = over.fieldChange.newContent;
					const rebasingOverRollback =
						overIntention === change.deletedBy.revision &&
						over.fieldChange.id === change.deletedBy.localId;
					const rebasingOverUndo =
						"revert" in overContent &&
						overContent.changeId.revision === change.deletedBy.revision &&
						overContent.changeId.localId === change.deletedBy.localId;
					if (rebasingOverRollback || rebasingOverUndo) {
						// Over is reviving the node that change.childChange is referring to.
						// Rebase change.childChange and remove deletedBy
						// because we revived the node that childChange refers to
						return {
							childChange: rebaseChild(
								change.childChange,
								overContent.changes,
								NodeExistenceState.Alive,
							),
						};
					}
				}
			}
		}

		{
			const rebasedChange = { ...change };

			let overChildChange: NodeChangeset | undefined;
			if (change.deletedBy === undefined && over.deletedBy === undefined) {
				overChildChange = over.childChange;
			}

			const rebasedChildChange = rebaseChild(change.childChange, overChildChange);
			if (rebasedChildChange !== undefined) {
				rebasedChange.childChange = rebasedChildChange;
			} else {
				delete rebasedChange.childChange;
			}

			return rebasedChange;
		}
	},

	amendRebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
	) => {
		const amendedChildChange = rebaseChild(change.childChange, overTagged.change.childChange);
		const amended = { ...change };
		if (amendedChildChange !== undefined) {
			amended.childChange = amendedChildChange;
		} else {
			delete amended.childChange;
		}
		return amended;
	},
};

export interface OptionalFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which replaces the field with `newContent`
	 * @param newContent - the new content for the field
	 * @param wasEmpty - whether the field is empty when creating this change
	 * @param id - the ID associated with the change.
	 */
	set(
		newContent: ITreeCursor | undefined,
		wasEmpty: boolean,
		id: ChangesetLocalId,
	): OptionalChangeset;
}

const optionalFieldEditor: OptionalFieldEditor = {
	set: (
		newContent: ITreeCursor | undefined,
		wasEmpty: boolean,
		id: ChangesetLocalId,
	): OptionalChangeset => ({
		fieldChange: {
			id,
			newContent:
				newContent === undefined
					? undefined
					: {
							set: jsonableTreeFromCursor(newContent),
					  },
			wasEmpty,
		},
	}),

	buildChildChange: (index: number, childChange: NodeChangeset): OptionalChangeset => {
		assert(index === 0, 0x404 /* Optional fields only support a single child node */);
		return { childChange };
	},
};

function deltaFromInsertAndChange(
	insertedContent: ITreeCursorSynchronous | undefined,
	nodeChange: NodeChangeset | undefined,
	deltaFromNode: ToDelta,
): Delta.Mark[] {
	if (insertedContent !== undefined) {
		const insert: Mutable<Delta.Insert> = {
			type: Delta.MarkType.Insert,
			content: [insertedContent],
		};
		if (nodeChange !== undefined) {
			const nodeDelta = deltaFromNode(nodeChange);
			populateChildModifications(nodeDelta, insert);
		}
		return [insert];
	}

	if (nodeChange !== undefined) {
		return [deltaFromNode(nodeChange)];
	}

	return [];
}

function deltaForDelete(
	nodeExists: boolean,
	nodeChange: NodeChangeset | undefined,
	deltaFromNode: ToDelta,
): Delta.Mark[] {
	if (!nodeExists) {
		return [];
	}

	const deleteDelta: Mutable<Delta.Delete> = { type: Delta.MarkType.Delete, count: 1 };
	if (nodeChange !== undefined) {
		const modify = deltaFromNode(nodeChange);
		deleteDelta.fields = modify.fields;
	}
	return [deleteDelta];
}

function optionalFieldIntoDelta(change: OptionalChangeset, deltaFromChild: ToDelta) {
	if (change.fieldChange === undefined) {
		if (change.deletedBy === undefined && change.childChange !== undefined) {
			return [deltaFromChild(change.childChange)];
		}
		return [];
	}

	const deleteDelta = deltaForDelete(
		!change.fieldChange.wasEmpty,
		change.deletedBy === undefined ? change.childChange : undefined,
		deltaFromChild,
	);

	const update = change.fieldChange?.newContent;
	let content: ITreeCursorSynchronous | undefined;
	if (update === undefined) {
		content = undefined;
	} else if ("set" in update) {
		content = singleTextCursor(update.set);
	} else {
		content = update.revert;
	}

	const insertDelta = deltaFromInsertAndChange(content, update?.changes, deltaFromChild);

	return [...deleteDelta, ...insertDelta];
}

/**
 * 0 or 1 items.
 */
export const optional: BrandedFieldKind<"Optional", Multiplicity.Optional, OptionalFieldEditor> =
	brandedFieldKind(
		"Optional",
		Multiplicity.Optional,
		{
			rebaser: optionalChangeRebaser,
			codecsFactory: makeOptionalFieldCodecFamily,
			editor: optionalFieldEditor,

			intoDelta: (change: OptionalChangeset, deltaFromChild: ToDelta) =>
				optionalFieldIntoDelta(change, deltaFromChild),
			isEmpty: (change: OptionalChangeset) =>
				change.childChange === undefined && change.fieldChange === undefined,
		},
		(types, other) =>
			(other.kind.identifier === sequence.identifier ||
				other.kind.identifier === optional.identifier) &&
			allowsTreeSchemaIdentifierSuperset(types, other.types),
		new Set([]),
	);

const valueFieldEditor: ValueFieldEditor = {
	...optionalFieldEditor,
	set: (newContent: ITreeCursor, id: ChangesetLocalId): OptionalChangeset =>
		optionalFieldEditor.set(newContent, false, id),
};

const valueChangeHandler: FieldChangeHandler<OptionalChangeset, ValueFieldEditor> = {
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
	"Forbidden",
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
	extends BrandedFieldKind<"Forbidden", Multiplicity.Forbidden, FieldEditor<any>> {}

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
