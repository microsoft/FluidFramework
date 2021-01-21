/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, assertArrayOfOne, assertNotUndefined, compareIterables, fail } from './Common';
import { compareEdits } from './EditUtilities';
import { Edit } from './PersistedTypes';
import { EditId } from './Identifiers';

/**
 * An ordered set of Edits associated with a SharedTree.
 * Supports fast lookup of edits by ID and enforces idempotence.
 * @public
 * @sealed
 */
export interface OrderedEditSet {
	/**
	 * @returns the length of this `OrderedEditSet`
	 */
	length: number;

	/**
	 * @returns the index of the edit with the given editId within this `OrderedEditSet`.
	 */
	indexOf(editId: EditId): number;

	/**
	 * @returns the edit at the given index within this `OrderedEditSet`.
	 */
	getAtIndex(index: number): Edit;

	/**
	 * @returns the Edit associated with the EditId or undefined if there is no such edit in the set.
	 */
	tryGetEdit(editId: EditId): Edit | undefined;

	[Symbol.iterator](): IterableIterator<Edit>;
}

interface SequencedOrderedEdit {
	readonly edit: Edit;
	readonly isLocal: false;
	readonly index: number;
}

interface LocalOrderedEdit {
	readonly edit: Edit;
	readonly isLocal: true;
	readonly localSequence: number;
}

type OrderedEdit = SequencedOrderedEdit | LocalOrderedEdit;

/**
 * The edit history log for SharedTree.
 * Contains only completed edits (no in-progress edits).
 * Ordered first by locality (acked or local), then by time of insertion.
 * May not contain more than one edit with the same ID.
 * @internal @sealed
 */
export class EditLog implements OrderedEditSet {
	private localEditSequence = 0;
	private version = 0;
	private readonly sequencedEdits: Edit[] = [];
	private readonly localEdits: Edit[] = [];
	private readonly allEdits: Map<EditId, OrderedEdit> = new Map();

	/**
	 * Construct an `EditLog` with the given sequenced `Edits`
	 */
	public constructor(sequencedEdits?: readonly Edit[]) {
		this.sequencedEdits = sequencedEdits === undefined ? [] : sequencedEdits.slice();
		for (const [index, edit] of this.sequencedEdits.entries()) {
			this.allEdits.set(edit.id, { edit, isLocal: false, index });
		}
	}

	/**
	 * Get a value which can be compared with === to determine if a log has not changed.
	 */
	public versionIdentifier(): unknown {
		return this.version;
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.length}
	 */
	public get length(): number {
		return this.numberOfSequencedEdits + this.numberOfLocalEdits;
	}

	/**
	 * The number of sequenced (acked) edits in the log.
	 */
	public get numberOfSequencedEdits(): number {
		return this.sequencedEdits.length;
	}

	/**
	 * The number of local (unacked) edits in the log.
	 */
	public get numberOfLocalEdits(): number {
		return this.localEdits.length;
	}

	/**
	 * @returns true iff the edit is contained in this 'EditLog' and it is a local edit (not sequenced).
	 */
	public isLocalEdit(editId: EditId): boolean {
		const edit = this.allEdits.get(editId);
		return edit !== undefined && edit.isLocal;
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.indexOf}
	 */
	public indexOf(editId: EditId): number {
		const orderedEdit = this.allEdits.get(editId) ?? fail('edit not found');

		if (orderedEdit.isLocal) {
			const firstLocal = assertNotUndefined(this.allEdits.get(this.localEdits[0].id));
			assert(firstLocal.isLocal);
			return this.sequencedEdits.length + orderedEdit.localSequence - firstLocal.localSequence;
		}
		return orderedEdit.index;
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.getAtIndex}
	 */
	public getAtIndex(index: number): Edit {
		if (index < this.sequencedEdits.length) {
			return this.sequencedEdits[index];
		}
		return this.localEdits[index - this.sequencedEdits.length];
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.tryGetEdit}
	 */
	public tryGetEdit(editId: EditId): Edit | undefined {
		return this.allEdits.get(editId)?.edit;
	}

	public *[Symbol.iterator](): IterableIterator<Edit> {
		yield* this.sequencedEdits;
		yield* this.localEdits;
	}

	/**
	 * Adds a sequenced (non-local) edit to the edit log.
	 * If the id of the supplied edit matches a local edit already present in the log, the local edit will be replaced.
	 */
	public addSequencedEdit(edit: Edit): void {
		this.version++;
		const sequencedEdit: SequencedOrderedEdit = { edit, index: this.sequencedEdits.length, isLocal: false };
		this.sequencedEdits.push(edit);
		const existingEdit = this.allEdits.get(edit.id);
		if (existingEdit !== undefined) {
			// New edit already exits: it must have been a local edit.
			assert(existingEdit.isLocal, 'Duplicate acked edit.');
			// Remove it from localEdits. Due to ordering requirements, it must be first.
			const oldLocalEdit = assertArrayOfOne(this.localEdits.splice(0, 1));
			assert(oldLocalEdit.id === edit.id, 'Causal ordering should be upheld');
		}

		this.allEdits.set(edit.id, sequencedEdit);
	}

	/**
	 * Adds a non-sequenced (local) edit to the edit log.
	 * Duplicate edits are ignored.
	 */
	public addLocalEdit(edit: Edit): void {
		this.version++;
		assert(!this.allEdits.has(edit.id));
		const localEdit: LocalOrderedEdit = { edit, localSequence: this.localEditSequence++, isLocal: true };
		this.localEdits.push(edit);
		this.allEdits.set(edit.id, localEdit);
	}

	/**
	 * @returns true iff this `EditLog` and `other` are equivalent, regardless of locality.
	 */
	public equals(other: EditLog): boolean {
		return compareIterables(this, other, compareEdits);
	}
}
