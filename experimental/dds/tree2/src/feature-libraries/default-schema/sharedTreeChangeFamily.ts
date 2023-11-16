/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily, ICodecOptions } from "../../codec";
import {
	ChangeFamily,
	ChangeRebaser,
	TaggedChange,
	EditBuilder,
	Delta,
	FieldKey,
	FieldKindIdentifier,
} from "../../core";
import { Mutable } from "../../util";
import {
	SchemaChange,
	FieldKindWithEditor,
	ModularChangeFamily,
	ModularChangeset,
	SchemaChangeFamily,
} from "../modular-schema";
import { makeSharedTreeChangeCodecFamily } from "./sharedTreeChangeCodecs";
import { SharedTreeChange } from "./sharedTreeChangeTypes";

export class SharedTreeEditor extends EditBuilder<SharedTreeChange> {
	public override applyChange(change: SharedTreeChange): void {
		super.applyChange(change);
	}
}

/**
 * Handles all changes that can be processed by a SharedTree.
 */
export class SharedTreeChangeFamily
	implements ChangeFamily<SharedTreeEditor, SharedTreeChange>, ChangeRebaser<SharedTreeChange>
{
	public readonly codecs: ICodecFamily<SharedTreeChange>;

	public constructor(
		public readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKindWithEditor>,
		public readonly modularChangeFamily: ModularChangeFamily,
		public readonly schemaChangeFamily: SchemaChangeFamily,
		codecOptions: ICodecOptions,
	) {
		this.codecs = makeSharedTreeChangeCodecFamily(fieldKinds, codecOptions);
	}

	public buildEditor(changeReceiver: (change: SharedTreeChange) => void): SharedTreeEditor {
		return new SharedTreeEditor(this, changeReceiver);
	}

	public compose(changes: TaggedChange<SharedTreeChange>[]): SharedTreeChange {
		const modularChanges: TaggedChange<ModularChangeset>[] = [];
		const schemaChanges: TaggedChange<SchemaChange>[] = [];
		for (const change of changes) {
			const { modularChange, schemaChange } = change.change;
			if (modularChange !== undefined) {
				modularChanges.push({
					change: modularChange,
					revision: change.revision,
					rollbackOf: change.rollbackOf,
				});
			}
			if (schemaChange !== undefined) {
				schemaChanges.push({
					change: schemaChange,
					revision: change.revision,
					rollbackOf: change.rollbackOf,
				});
			}
		}

		const composedChange: Mutable<SharedTreeChange> = {};
		if (modularChanges.length > 0) {
			composedChange.modularChange = this.modularChangeFamily.compose(modularChanges);
		}
		if (schemaChanges.length > 0) {
			composedChange.schemaChange = this.schemaChangeFamily.compose(schemaChanges);
		}
		return composedChange;
	}

	public invert(change: TaggedChange<SharedTreeChange>, isRollback: boolean): SharedTreeChange {
		const invertedChange: Mutable<SharedTreeChange> = {};
		const { modularChange, schemaChange } = change.change;
		if (modularChange !== undefined) {
			invertedChange.modularChange = this.modularChangeFamily.invert(
				{ change: modularChange, revision: change.revision, rollbackOf: change.rollbackOf },
				isRollback,
			);
		}
		if (schemaChange !== undefined) {
			invertedChange.schemaChange = this.schemaChangeFamily.invert(
				{ change: schemaChange, revision: change.revision, rollbackOf: change.rollbackOf },
				isRollback,
			);
		}
		return invertedChange;
	}

	public rebase(
		change: SharedTreeChange,
		over: TaggedChange<SharedTreeChange>,
	): SharedTreeChange {
		// If a tree change is being rebased over another tree change (and there are no schema changes), delegate to the tree change rebaser.
		if (change.schemaChange === undefined && over.change.schemaChange === undefined) {
			return change.modularChange !== undefined && over.change.modularChange !== undefined
				? {
						modularChange: this.modularChangeFamily.rebase(change.modularChange, {
							change: over.change.modularChange,
							revision: over.revision,
							rollbackOf: over.rollbackOf,
						}),
				  }
				: change;
		}
		// If a schema change is being rebased over another schema change (and there are no tree changes), delegate to the schema change rebaser.
		if (change.modularChange === undefined && over.change.modularChange === undefined) {
			return change.schemaChange !== undefined && over.change.schemaChange !== undefined
				? {
						schemaChange: this.schemaChangeFamily.rebase(change.schemaChange, {
							change: over.change.schemaChange,
							revision: over.revision,
							rollbackOf: over.rollbackOf,
						}),
				  }
				: change;
		}
		// If there is any mix of tree changes and schema changes being rebased over each other, conflict for now.
		return {};
	}

	public intoDelta(change: TaggedChange<SharedTreeChange>): Delta.Root {
		const map = new Map<FieldKey, Delta.FieldChanges>();
		if (change.change.modularChange !== undefined) {
			for (const [field, mark] of this.modularChangeFamily.intoDelta({
				change: change.change.modularChange,
				revision: change.revision,
			})) {
				map.set(field, mark);
			}
		}
		if (change.change.schemaChange !== undefined) {
			for (const [field, mark] of this.schemaChangeFamily.intoDelta({
				change: change.change.schemaChange,
				revision: change.revision,
			})) {
				map.set(field, mark);
			}
		}
		return map;
	}

	public get rebaser(): ChangeRebaser<SharedTreeChange> {
		return this;
	}
}
