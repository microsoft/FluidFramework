/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, IsoBuffer } from "@fluidframework/common-utils";
import {
	ChangeEncoder,
	FieldKindIdentifier,
	Delta,
	JsonableTree,
	ITreeCursor,
	TaggedChange,
	ITreeCursorSynchronous,
	tagChange,
	FieldSchema,
	RevisionTag,
	TreeTypeSet,
} from "../core";
import { brand, fail, JsonCompatible, JsonCompatibleReadOnly, Mutable } from "../util";
import { singleTextCursor, jsonableTreeFromCursor } from "./treeTextCursor";
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
	FieldChangeEncoder,
	NodeChangeDecoder,
	NodeChangeEncoder,
	FieldEditor,
	referenceFreeFieldChangeRebaser,
	NodeReviver,
	isolatedFieldChangeRebaser,
} from "./modular-schema";
import { sequenceFieldChangeHandler, SequenceFieldEditor } from "./sequence-field";
import { populateChildModifications } from "./deltaUtils";

type BrandedFieldKind<
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
	allowsTreeSupersetOf: (originalTypes: TreeTypeSet, superset: FieldSchema) => boolean,
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
 * Encoder for changesets which carry no information.
 *
 * @sealed
 */
export class UnitEncoder extends ChangeEncoder<0> {
	public encodeForJson(formatVersion: number, change: 0): JsonCompatible {
		return 0;
	}

	public override encodeBinary(formatVersion: number, change: 0): IsoBuffer {
		return IsoBuffer.from("");
	}

	public decodeJson(formatVersion: number, change: JsonCompatible): 0 {
		return 0;
	}

	public override decodeBinary(formatVersion: number, change: IsoBuffer): 0 {
		return 0;
	}
}

/**
 * Encoder for changesets which are just a json compatible value.
 *
 * @sealed
 */
export class ValueEncoder<T extends JsonCompatibleReadOnly> extends ChangeEncoder<T> {
	public encodeForJson(formatVersion: number, change: T): JsonCompatibleReadOnly {
		return change;
	}

	public decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): T {
		return change as T;
	}
}

/**
 * @returns a ChangeRebaser that assumes all the changes commute, meaning that order does not matter.
 */
function commutativeRebaser<TChange>(data: {
	compose: (changes: TChange[]) => TChange;
	invert: (changes: TChange) => TChange;
}): FieldChangeRebaser<TChange> {
	const rebase = (change: TChange, _over: TChange) => change;
	return referenceFreeFieldChangeRebaser({ ...data, rebase });
}

/**
 * Picks the last value written.
 *
 * TODO: it seems impossible for this to obey the desired axioms.
 * Specifically inverse needs to cancel, restoring the value from the previous change which was discarded.
 */
export function lastWriteWinsRebaser<TChange>(data: {
	noop: TChange;
	invert: (changes: TChange) => TChange;
}): FieldChangeRebaser<TChange> {
	const compose = (changes: TChange[]) =>
		changes.length >= 0 ? changes[changes.length - 1] : data.noop;
	const rebase = (change: TChange, _over: TChange) => change;
	return referenceFreeFieldChangeRebaser({ ...data, compose, rebase });
}

export interface Replacement<T> {
	old: T;
	new: T;
}

export type ReplaceOp<T> = Replacement<T> | 0;

/**
 * Picks the last value written.
 *
 * Consistent if used on valid paths with correct old states.
 */
export function replaceRebaser<T>(): FieldChangeRebaser<ReplaceOp<T>> {
	return referenceFreeFieldChangeRebaser({
		rebase: (change: ReplaceOp<T>, over: ReplaceOp<T>) => {
			if (change === 0) {
				return 0;
			}
			if (over === 0) {
				return change;
			}
			return { old: over.new, new: change.new };
		},
		compose: (changes: ReplaceOp<T>[]) => {
			const f = changes.filter((c): c is Replacement<T> => c !== 0);
			if (f.length === 0) {
				return 0;
			}
			for (let index = 1; index < f.length; index++) {
				assert(f[index - 1].new === f[index].old, 0x3a4 /* adjacent replaces must match */);
			}
			return { old: f[0].old, new: f[f.length - 1].new };
		},
		invert: (changes: ReplaceOp<T>) => {
			return changes === 0 ? 0 : { old: changes.new, new: changes.old };
		},
	});
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
	encoder: new UnitEncoder(),
	editor: { buildChildChange: (index, change) => fail("Child changes not supported") },
	intoDelta: (change: 0, deltaFromChild: ToDelta): Delta.MarkList => [],
	isEmpty: (change: 0) => true,
};

/**
 * ChangeHandler that does not support any changes.
 *
 * TODO: Due to floating point precision compose is not quite associative.
 * This may violate our requirements.
 * This could be fixed by making this integer only
 * and handling values past Number.MAX_SAFE_INTEGER (ex: via an arbitrarily large integer library)
 * or via modular arithmetic.
 */
export const counterHandle: FieldChangeHandler<number> = {
	rebaser: commutativeRebaser({
		compose: (changes: number[]) => changes.reduce((a, b) => a + b, 0),
		invert: (change: number) => -change,
	}),
	encoder: new ValueEncoder<number>(),
	editor: { buildChildChange: (index, change) => fail("Child changes not supported") },
	intoDelta: (change: number, deltaFromChild: ToDelta): Delta.MarkList => [
		{
			type: Delta.MarkType.Modify,
			setValue: change,
		},
	],
	isEmpty: (change: number) => change === 0,
};

/**
 * Field kind for counters.
 * Stores a single value which corresponds to number which can be added to.
 *
 * This is an example of a few interesting things:
 *
 * - A field kind with some constraints on what can be under it type wise.
 * Other possible examples which would do this include sets, maps (for their keys),
 * or any domain specific specialized kinds.
 *
 * - A field kind with commutative edits.
 *
 * TODO:
 * What should the subtrees under this look like?
 * How does it prevent / interact with direct edits to the subtree (ex: set value)?
 * How should it use its type set?
 * How should it handle lack of associative addition due to precision and overflow?
 */
export const counter: BrandedFieldKind<
	"Counter",
	Multiplicity.Value,
	FieldEditor<number>
> = brandedFieldKind(
	"Counter",
	Multiplicity.Value,
	counterHandle,
	(types, other) => other.kind.identifier === counter.identifier,
	new Set(),
);

export type NodeUpdate =
	| {
			set: JsonableTree;
			changes?: NodeChangeset;
	  }
	| {
			/**
			 * The node being restored.
			 */
			revert: ITreeCursorSynchronous;
			revision: RevisionTag | undefined;
			changes?: NodeChangeset;
	  };

type EncodedNodeUpdate =
	| {
			set: JsonableTree;
			changes?: JsonCompatibleReadOnly;
	  }
	| {
			/**
			 * The node being restored.
			 */
			revert: JsonableTree;
			revision: RevisionTag | undefined;
			changes?: JsonCompatibleReadOnly;
	  };

export interface ValueChangeset {
	value?: NodeUpdate;
	changes?: NodeChangeset;
}

const valueRebaser: FieldChangeRebaser<ValueChangeset> = isolatedFieldChangeRebaser({
	compose: (
		changes: TaggedChange<ValueChangeset>[],
		composeChildren: NodeChangeComposer,
	): ValueChangeset => {
		if (changes.length === 0) {
			return {};
		}
		let newValue: NodeUpdate | undefined;
		const childChanges: TaggedChange<NodeChangeset>[] = [];
		for (const { change, revision } of changes) {
			if (change.value !== undefined) {
				newValue = change.value;

				// The previous changes applied to a different value, so we discard them.
				// TODO: Consider if we should represent muted changes
				childChanges.length = 0;
			}

			if (change.changes !== undefined) {
				childChanges.push(tagChange(change.changes, revision));
			}
		}

		const composed: ValueChangeset = {};
		if (newValue !== undefined) {
			composed.value = newValue;
		}

		if (childChanges.length > 0) {
			composed.changes = composeChildren(childChanges);
		}

		return composed;
	},

	invert: (
		{ revision, change }: TaggedChange<ValueChangeset>,
		invertChild: NodeChangeInverter,
		reviver: NodeReviver,
	): ValueChangeset => {
		const inverse: ValueChangeset = {};
		if (change.changes !== undefined) {
			inverse.changes = invertChild(change.changes, 0);
		}
		if (change.value !== undefined) {
			assert(revision !== undefined, 0x591 /* Unable to revert to undefined revision */);
			inverse.value = { revert: reviver(revision, 0, 1)[0], revision };
		}
		return inverse;
	},

	rebase: (
		change: ValueChangeset,
		over: TaggedChange<ValueChangeset>,
		rebaseChild: NodeChangeRebaser,
	): ValueChangeset => {
		if (change.changes === undefined || over.change.changes === undefined) {
			return change;
		}
		return { ...change, changes: rebaseChild(change.changes, over.change.changes) };
	},
});

interface EncodedValueChangeset {
	value?: EncodedNodeUpdate;
	changes?: JsonCompatibleReadOnly;
}

const valueFieldEncoder: FieldChangeEncoder<ValueChangeset> = {
	encodeForJson: (
		formatVersion: number,
		change: ValueChangeset,
		encodeChild: NodeChangeEncoder,
	) => {
		const encoded: EncodedValueChangeset & JsonCompatibleReadOnly = {};
		if (change.value !== undefined) {
			encoded.value = encodeNodeUpdate(change.value, encodeChild);
		}

		if (change.changes !== undefined) {
			encoded.changes = encodeChild(change.changes);
		}

		return encoded;
	},

	decodeJson: (
		formatVersion: number,
		change: JsonCompatibleReadOnly,
		decodeChild: NodeChangeDecoder,
	) => {
		const encoded = change as EncodedValueChangeset;
		const decoded: ValueChangeset = {};
		if (encoded.value !== undefined) {
			decoded.value = decodeNodeUpdate(encoded.value, decodeChild);
		}

		if (encoded.changes !== undefined) {
			decoded.changes = decodeChild(encoded.changes);
		}

		return decoded;
	},
};

function encodeNodeUpdate(update: NodeUpdate, encodeChild: NodeChangeEncoder): EncodedNodeUpdate {
	const encoded: EncodedNodeUpdate =
		"revert" in update
			? {
					revert: jsonableTreeFromCursor(update.revert),
					revision: update.revision,
			  }
			: {
					set: update.set,
			  };

	if (update.changes !== undefined) {
		encoded.changes = encodeChild(update.changes);
	}

	return encoded;
}

function decodeNodeUpdate(encoded: EncodedNodeUpdate, decodeChild: NodeChangeDecoder): NodeUpdate {
	const decoded: NodeUpdate =
		"revert" in encoded
			? {
					revert: singleTextCursor(encoded.revert),
					revision: encoded.revision,
			  }
			: { set: encoded.set };

	if (encoded.changes !== undefined) {
		decoded.changes = decodeChild(encoded.changes);
	}

	return decoded;
}

export interface ValueFieldEditor extends FieldEditor<ValueChangeset> {
	/**
	 * Creates a change which replaces the current value of the field with `newValue`.
	 */
	set(newValue: ITreeCursor): ValueChangeset;
}

const valueFieldEditor: ValueFieldEditor = {
	buildChildChange: (index, change) => {
		assert(index === 0, 0x3b6 /* Value fields only support a single child node */);
		return { changes: change };
	},

	set: (newValue: ITreeCursor) => ({ value: { set: jsonableTreeFromCursor(newValue) } }),
};

const valueChangeHandler: FieldChangeHandler<ValueChangeset, ValueFieldEditor> = {
	rebaser: valueRebaser,
	encoder: valueFieldEncoder,
	editor: valueFieldEditor,

	intoDelta: (change: ValueChangeset, deltaFromChild: ToDelta) => {
		if (change.value !== undefined) {
			const newValue: ITreeCursorSynchronous =
				"revert" in change.value ? change.value.revert : singleTextCursor(change.value.set);
			const insertDelta = deltaFromInsertAndChange(newValue, change.changes, deltaFromChild);
			return [{ type: Delta.MarkType.Delete, count: 1 }, ...insertDelta];
		}

		return change.changes === undefined ? [] : [deltaFromChild(change.changes)];
	},

	isEmpty: (change: ValueChangeset) => change.changes === undefined && change.value === undefined,
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
				other.kind.identifier === optional.identifier) &&
			allowsTreeSchemaIdentifierSuperset(types, other.types),
		new Set(),
	);

export interface OptionalFieldChange {
	/**
	 * The new content for the trait. If undefined, the trait will be cleared.
	 */
	newContent?: NodeUpdate;

	/**
	 * Whether the field was empty in the state this change is based on.
	 */
	wasEmpty: boolean;
}

export interface OptionalChangeset {
	/**
	 * If defined, specifies the new content for the field.
	 */
	fieldChange?: OptionalFieldChange;

	/**
	 * Changes to the node which were in the field before this changeset is applied, or the node deleted in this field in the given revision
	 */
	childChange?: NodeChangeset;

	/**
	 * The revision the node `childChange` is referring to was deleted in.
	 * If undefined, `childChange` refers to the node currently in this field.
	 *
	 * This representation is sufficient for representing changes to the node present before this changeset and
	 * after this changeset, but not for changes to nodes that existed only transiently in a transaction.
	 */
	deletedBy?: RevisionTag;
}

const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = isolatedFieldChangeRebaser({
	compose: (
		changes: TaggedChange<OptionalChangeset>[],
		composeChild: NodeChangeComposer,
	): OptionalChangeset => {
		let fieldChange: OptionalFieldChange | undefined;
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
					fieldChange = { wasEmpty: change.fieldChange.wasEmpty };
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
					"Shouldn't have new node changes if there is no new node",
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

	invert: (
		{ revision, change }: TaggedChange<OptionalChangeset>,
		invertChild: NodeChangeInverter,
		reviver: NodeReviver,
	): OptionalChangeset => {
		const inverse: OptionalChangeset = {};

		const fieldChange = change.fieldChange;
		if (fieldChange !== undefined) {
			inverse.fieldChange = { wasEmpty: fieldChange.newContent === undefined };
			if (fieldChange.newContent?.changes !== undefined) {
				// The node inserted by change will be the node deleted by inverse
				// Move the inverted changes to the child change field
				inverse.childChange = invertChild(fieldChange.newContent.changes, 0);
			}

			if (!fieldChange.wasEmpty) {
				assert(revision !== undefined, 0x592 /* Unable to revert to undefined revision */);
				inverse.fieldChange.newContent = { revert: reviver(revision, 0, 1)[0], revision };
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

	rebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
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
				if (change.deletedBy === undefined) {
					// `change.childChange` refers to the node being deleted by `over`.
					return {
						childChange: rebaseChild(
							change.childChange,
							over.deletedBy === undefined ? undefined : over.childChange,
						),
						deletedBy: overTagged.revision,
					};
				} else if (
					over.fieldChange.newContent !== undefined &&
					"revert" in over.fieldChange.newContent &&
					over.fieldChange.newContent.revision === change.deletedBy
				) {
					// Over is reviving the node that change.childChange is referring to.
					// Rebase change.childChange and remove deletedBy
					// because we revived the node that childChange refers to
					return {
						childChange: rebaseChild(
							change.childChange,
							over.fieldChange.newContent.changes,
						),
					};
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
});

export interface OptionalFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which replaces the field with `newContent`
	 * @param newContent - the new content for the field
	 * @param wasEmpty - whether the field is empty when creating this change
	 */
	set(newContent: ITreeCursor | undefined, wasEmpty: boolean): OptionalChangeset;
}

const optionalFieldEditor: OptionalFieldEditor = {
	set: (newContent: ITreeCursor | undefined, wasEmpty: boolean): OptionalChangeset => ({
		fieldChange: {
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

interface EncodedOptionalFieldChange {
	/**
	 * The new content for the trait. If undefined, the trait will be cleared.
	 */
	newContent?: EncodedNodeUpdate;

	/**
	 * Whether the field was empty in the state this change is based on.
	 */
	wasEmpty: boolean;
}

interface EncodedOptionalChangeset {
	fieldChange?: EncodedOptionalFieldChange;
	childChange?: JsonCompatibleReadOnly;
}

const optionalFieldEncoder: FieldChangeEncoder<OptionalChangeset> = {
	encodeForJson: (
		formatVersion: number,
		change: OptionalChangeset,
		encodeChild: NodeChangeEncoder,
	) => {
		const encoded: EncodedOptionalChangeset & JsonCompatibleReadOnly = {};
		if (change.fieldChange !== undefined) {
			encoded.fieldChange = { wasEmpty: change.fieldChange.wasEmpty };
			if (change.fieldChange.newContent !== undefined) {
				encoded.fieldChange.newContent = encodeNodeUpdate(
					change.fieldChange.newContent,
					encodeChild,
				);
			}
		}

		if (change.childChange !== undefined) {
			encoded.childChange = encodeChild(change.childChange);
		}

		return encoded;
	},

	decodeJson: (
		formatVersion: number,
		change: JsonCompatibleReadOnly,
		decodeChild: NodeChangeDecoder,
	) => {
		const encoded = change as EncodedOptionalChangeset;
		const decoded: OptionalChangeset = {};
		if (encoded.fieldChange !== undefined) {
			decoded.fieldChange = {
				wasEmpty: encoded.fieldChange.wasEmpty,
			};

			if (encoded.fieldChange.newContent !== undefined) {
				decoded.fieldChange.newContent = decodeNodeUpdate(
					encoded.fieldChange.newContent,
					decodeChild,
				);
			}
		}

		if (encoded.childChange !== undefined) {
			decoded.childChange = decodeChild(encoded.childChange);
		}

		return decoded;
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
		deleteDelta.setValue = modify.setValue;
		deleteDelta.fields = modify.fields;
	}
	return [deleteDelta];
}

/**
 * 0 or 1 items.
 */
export const optional: FieldKind<OptionalFieldEditor, Multiplicity.Optional> = new FieldKind(
	brand("Optional"),
	Multiplicity.Optional,
	{
		rebaser: optionalChangeRebaser,
		encoder: optionalFieldEncoder,
		editor: optionalFieldEditor,

		intoDelta: (change: OptionalChangeset, deltaFromChild: ToDelta) => {
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
		},

		isEmpty: (change: OptionalChangeset) =>
			change.childChange === undefined && change.fieldChange === undefined,
	},
	(types, other) =>
		(other.kind.identifier === sequence.identifier ||
			other.kind.identifier === optional.identifier) &&
		allowsTreeSchemaIdentifierSuperset(types, other.types),
	new Set([value.identifier]),
);

/**
 * 0 or more items.
 */
export const sequence: FieldKind<SequenceFieldEditor, Multiplicity.Sequence> = new FieldKind(
	brand("Sequence"),
	Multiplicity.Sequence,
	sequenceFieldChangeHandler,
	(types, other) =>
		other.kind.identifier === sequence.identifier &&
		allowsTreeSchemaIdentifierSuperset(types, other.types),
	// TODO: add normalizer/importers for handling ops from other kinds.
	new Set([]),
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
	[value, optional, sequence, forbidden, counter].map((s) => [s.identifier, s]),
);
