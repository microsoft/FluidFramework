/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecFamily, ICodecOptions } from "../../codec";
import {
	ChangeFamily,
	ChangeRebaser,
	Delta,
	UpPath,
	ITreeCursor,
	ChangeFamilyEditor,
	FieldUpPath,
	TaggedChange,
	compareFieldUpPaths,
	topDownPath,
	FieldKey,
} from "../../core";
import { Mutable, brand, isReadonlyArray } from "../../util";
import {
	ModularChangeFamily,
	ModularEditBuilder,
	FieldChangeset,
	ModularChangeset,
} from "../modular-schema";
import { SchemaChange, SchemaChangeFamily, SchemaEditor } from "../schema-editing";
import { fieldKinds, optional, sequence, required as valueFieldKind } from "./defaultFieldKinds";
import { SharedTreeChange } from "./defaultChangeTypes";
import { makeSharedTreeChangeCodecFamily } from "./defaultChangeCodecs";

export type DefaultChangeset = SharedTreeChange;

/**
 * Implementation of {@link ChangeFamily} based on the default set of supported field kinds.
 *
 * @sealed
 */
export class DefaultChangeFamily
	implements ChangeFamily<DefaultEditBuilder, DefaultChangeset>, ChangeRebaser<DefaultChangeset>
{
	public readonly codecs: ICodecFamily<DefaultChangeset>;
	private readonly modularChangeFamily: ModularChangeFamily;
	private readonly schemaChangeFamily: SchemaChangeFamily;

	public constructor(codecOptions: ICodecOptions) {
		this.modularChangeFamily = new ModularChangeFamily(fieldKinds, codecOptions);
		this.schemaChangeFamily = new SchemaChangeFamily(codecOptions);
		this.codecs = makeSharedTreeChangeCodecFamily(fieldKinds, codecOptions);
	}

	public buildEditor(changeReceiver: (change: DefaultChangeset) => void): DefaultEditBuilder {
		return new DefaultEditBuilder(
			this.modularChangeFamily,
			this.schemaChangeFamily,
			changeReceiver,
		);
	}

	public compose(changes: TaggedChange<DefaultChangeset>[]): DefaultChangeset {
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

		const composedChange: Mutable<DefaultChangeset> = {};
		if (modularChanges.length > 0) {
			composedChange.modularChange = this.modularChangeFamily.compose(modularChanges);
		}
		if (schemaChanges.length > 0) {
			composedChange.schemaChange = this.schemaChangeFamily.compose(schemaChanges);
		}
		return composedChange;
	}

	public invert(change: TaggedChange<DefaultChangeset>, isRollback: boolean): DefaultChangeset {
		const invertedChange: Mutable<DefaultChangeset> = {};
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
		change: DefaultChangeset,
		over: TaggedChange<DefaultChangeset>,
	): DefaultChangeset {
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

	public intoDelta(change: TaggedChange<DefaultChangeset>): Delta.Root {
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

	public get rebaser(): ChangeRebaser<DefaultChangeset> {
		return this;
	}
}

/**
 * Default editor for transactions.
 * @alpha
 */
export interface IDefaultEditBuilder {
	/**
	 * @param field - the value field which is being edited under the parent node
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	valueField(field: FieldUpPath): ValueFieldEditBuilder;

	/**
	 * @param field - the optional field which is being edited under the parent node
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	optionalField(field: FieldUpPath): OptionalFieldEditBuilder;

	/**
	 * @param field - the sequence field which is being edited under the parent node
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	sequenceField(field: FieldUpPath): SequenceFieldEditBuilder;

	/**
	 * Moves a subsequence from one sequence field to another sequence field.
	 *
	 * Note that the `destinationIndex` is interpreted based on the state of the sequence *before* the move operation.
	 * For example, `move(field, 0, 1, field, 2)` changes `[A, B, C]` to `[B, A, C]`.
	 */
	move(
		sourceField: FieldUpPath,
		sourceIndex: number,
		count: number,
		destinationField: FieldUpPath,
		destinationIndex: number,
	): void;

	// TODO: document
	addNodeExistsConstraint(path: UpPath): void;
}

/**
 * Implementation of {@link IDefaultEditBuilder} based on the default set of supported field kinds.
 * @sealed
 */
export class DefaultEditBuilder implements ChangeFamilyEditor, IDefaultEditBuilder {
	private readonly modularBuilder: ModularEditBuilder;
	private readonly schemaBuilder: SchemaEditor;

	public constructor(
		family: ChangeFamily<ChangeFamilyEditor, DefaultChangeset>,
		changeReceiver: (change: DefaultChangeset) => void,
	) {
		this.modularBuilder = new ModularEditBuilder(modularFamily, (modularChange) => {
			changeReceiver({ modularChange });
		});
		this.schemaBuilder = new SchemaEditor(schemaFamily, (schemaChange) => {
			changeReceiver({ schemaChange });
		});
	}

	public enterTransaction(): void {
		this.modularBuilder.enterTransaction();
	}
	public exitTransaction(): void {
		this.modularBuilder.exitTransaction();
	}

	public addNodeExistsConstraint(path: UpPath): void {
		this.modularBuilder.addNodeExistsConstraint(path);
	}

	public valueField(field: FieldUpPath): ValueFieldEditBuilder {
		return {
			set: (newContent: ITreeCursor): void => {
				const id = this.modularBuilder.generateId();
				const buildId = this.modularBuilder.generateId();
				const change: FieldChangeset = brand(
					valueFieldKind.changeHandler.editor.set(newContent, id, buildId),
				);
				this.modularBuilder.submitChange(field, valueFieldKind.identifier, change);
			},
		};
	}

	public optionalField(field: FieldUpPath): OptionalFieldEditBuilder {
		return {
			set: (newContent: ITreeCursor | undefined, wasEmpty: boolean): void => {
				const id = this.modularBuilder.generateId();
				const optionalChange =
					newContent === undefined
						? optional.changeHandler.editor.clear(wasEmpty, id)
						: optional.changeHandler.editor.set(
								newContent,
								wasEmpty,
								id,
								this.modularBuilder.generateId(),
						  );
				const change: FieldChangeset = brand(optionalChange);
				this.modularBuilder.submitChange(field, optional.identifier, change);
			},
		};
	}

	public move(
		sourceField: FieldUpPath,
		sourceIndex: number,
		count: number,
		destinationField: FieldUpPath,
		destIndex: number,
	): void {
		const moveId = this.modularBuilder.generateId(count);
		if (compareFieldUpPaths(sourceField, destinationField)) {
			const change = sequence.changeHandler.editor.move(
				sourceIndex,
				count,
				destIndex,
				moveId,
			);
			this.modularBuilder.submitChange(sourceField, sequence.identifier, brand(change));
		} else {
			const detachPath = topDownPath(sourceField.parent);
			const attachPath = topDownPath(destinationField.parent);
			const sharedDepth = getSharedPrefixLength(detachPath, attachPath);
			let adjustedAttachField = destinationField;
			// After the above loop, `sharedDepth` is the number of elements, starting from the root,
			// that both paths have in common.
			if (sharedDepth === detachPath.length) {
				const attachField = attachPath[sharedDepth]?.parentField ?? destinationField.field;
				if (attachField === sourceField.field) {
					// The detach occurs in an ancestor field of the field where the attach occurs.
					let attachAncestorIndex = attachPath[sharedDepth]?.parentIndex ?? sourceIndex;
					if (attachAncestorIndex < sourceIndex) {
						// The attach path runs through a node located before the detached nodes.
						// No need to adjust the attach path.
					} else {
						assert(
							sourceIndex + count <= attachAncestorIndex,
							"Invalid move: the destination is below one of the moved elements.",
						);
						// The attach path runs through a node located after the detached nodes.
						// adjust the index for the node at that depth of the path, so that it is interpreted correctly
						// in the composition performed by `submitChanges`.
						attachAncestorIndex -= count;
						let parent: UpPath | undefined = attachPath[sharedDepth - 1];
						parent = {
							parent,
							parentIndex: attachAncestorIndex,
							parentField: attachPath[sharedDepth].parentField,
						};
						for (let i = sharedDepth + 1; i < attachPath.length; i += 1) {
							parent = {
								...attachPath[i],
								parent,
							};
						}
						adjustedAttachField = { parent, field: destinationField.field };
					}
				}
			}
			const moveOut = sequence.changeHandler.editor.moveOut(sourceIndex, count, moveId);
			const moveIn = sequence.changeHandler.editor.moveIn(destIndex, count, moveId);
			this.modularBuilder.submitChanges(
				[
					{
						field: sourceField,
						fieldKind: sequence.identifier,
						change: brand(moveOut),
					},
					{
						field: adjustedAttachField,
						fieldKind: sequence.identifier,
						change: brand(moveIn),
					},
				],
				moveId,
			);
		}
	}

	public sequenceField(field: FieldUpPath): SequenceFieldEditBuilder {
		return {
			insert: (index: number, newContent: ITreeCursor | readonly ITreeCursor[]): void => {
				const content = isReadonlyArray(newContent) ? newContent : [newContent];
				const length = content.length;
				if (length === 0) {
					return;
				}

				const firstId = this.modularBuilder.generateId(length);
				const change: FieldChangeset = brand(
					sequence.changeHandler.editor.insert(index, content, firstId),
				);
				this.modularBuilder.submitChange(
					field,
					sequence.identifier,
					change,
					brand((firstId as number) + length - 1),
				);
			},
			delete: (index: number, count: number): void => {
				if (count === 0) {
					return;
				}
				const id = this.modularBuilder.generateId(count);
				const change: FieldChangeset = brand(
					sequence.changeHandler.editor.delete(index, count, id),
				);
				this.modularBuilder.submitChange(field, sequence.identifier, change);
			},
			move: (sourceIndex: number, count: number, destIndex: number): void => {
				const moveId = this.modularBuilder.generateId(count);
				const change = sequence.changeHandler.editor.move(
					sourceIndex,
					count,
					destIndex,
					moveId,
				);
				this.modularBuilder.submitChange(field, sequence.identifier, brand(change));
			},
		};
	}
}

/**
 * @alpha
 */
export interface ValueFieldEditBuilder {
	/**
	 * Issues a change which replaces the current newContent of the field with `newContent`.
	 * @param newContent - the new content for the field. Must be in Nodes mode.
	 */
	set(newContent: ITreeCursor): void;
}

/**
 * @alpha
 */
export interface OptionalFieldEditBuilder {
	/**
	 * Issues a change which replaces the current newContent of the field with `newContent`
	 * @param newContent - the new content for the field. Must be in Nodes mode.
	 * @param wasEmpty - whether the field is empty when creating this change
	 */
	set(newContent: ITreeCursor | undefined, wasEmpty: boolean): void;
}

/**
 * @alpha
 */
export interface SequenceFieldEditBuilder {
	/**
	 * Issues a change which inserts the `newContent` at the given `index`.
	 * @param index - the index at which to insert the `newContent`.
	 * @param newContent - the new content to be inserted in the field. Cursors must be in Nodes mode.
	 */
	insert(index: number, newContent: ITreeCursor | readonly ITreeCursor[]): void;

	/**
	 * Issues a change which deletes `count` elements starting at the given `index`.
	 * @param index - The index of the first deleted element.
	 * @param count - The number of elements to delete.
	 */
	delete(index: number, count: number): void;

	/**
	 * Issues a change which moves `count` elements starting at `sourceIndex` to `destIndex`.
	 * @param sourceIndex - the index of the first moved element.
	 * @param count - the number of elements to move.
	 * @param destIndex - the index the elements are moved to, interpreted before detaching the moved elements.
	 */
	move(sourceIndex: number, count: number, destIndex: number): void;
}

/**
 * @returns The number of path elements that both paths share, starting at index 0.
 */
function getSharedPrefixLength(pathA: readonly UpPath[], pathB: readonly UpPath[]): number {
	const minDepth = Math.min(pathA.length, pathB.length);
	let sharedDepth = 0;
	while (sharedDepth < minDepth) {
		const detachStep = pathA[sharedDepth];
		const attachStep = pathB[sharedDepth];
		if (detachStep !== attachStep) {
			if (
				detachStep.parentField !== attachStep.parentField ||
				detachStep.parentIndex !== attachStep.parentIndex
			) {
				break;
			}
		}
		sharedDepth += 1;
	}
	return sharedDepth;
}
