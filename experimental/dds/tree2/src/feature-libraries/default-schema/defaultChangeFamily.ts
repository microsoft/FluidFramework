/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { OptionalChangeset } from "../optional-field";
import { ICodecFamily, ICodecOptions } from "../../codec";
import {
	ChangeFamily,
	ChangeRebaser,
	UpPath,
	ITreeCursor,
	ChangeFamilyEditor,
	FieldUpPath,
	compareFieldUpPaths,
	topDownPath,
	TaggedChange,
	DeltaRoot,
	ChangesetLocalId,
	DeltaDetachedNodeId,
} from "../../core";
import { brand, isReadonlyArray } from "../../util";
import {
	ModularChangeFamily,
	ModularEditBuilder,
	FieldChangeset,
	ModularChangeset,
	FieldEditDescription,
	intoDelta as intoModularDelta,
	relevantRemovedRoots as relevantModularRemovedRoots,
	EditDescription,
} from "../modular-schema";
import { fieldKinds, optional, sequence, required as valueFieldKind } from "./defaultFieldKinds";

export type DefaultChangeset = ModularChangeset;

/**
 * Implementation of {@link ChangeFamily} based on the default set of supported field kinds.
 *
 * @sealed
 */
export class DefaultChangeFamily implements ChangeFamily<DefaultEditBuilder, DefaultChangeset> {
	private readonly modularFamily: ModularChangeFamily;

	public static readonly emptyChange: DefaultChangeset = ModularChangeFamily.emptyChange;

	public constructor(codecOptions: ICodecOptions) {
		this.modularFamily = new ModularChangeFamily(fieldKinds, codecOptions);
	}

	public get rebaser(): ChangeRebaser<DefaultChangeset> {
		return this.modularFamily.rebaser;
	}

	public get codecs(): ICodecFamily<DefaultChangeset> {
		return this.modularFamily.codecs;
	}

	public buildEditor(changeReceiver: (change: DefaultChangeset) => void): DefaultEditBuilder {
		return new DefaultEditBuilder(this, changeReceiver);
	}
}

/**
 * @param change - The change to convert into a delta.
 */
export function intoDelta(taggedChange: TaggedChange<ModularChangeset>): DeltaRoot {
	return intoModularDelta(taggedChange, fieldKinds);
}

/**
 * Returns the set of removed roots that should be in memory for the given change to be applied.
 * A removed root is relevant if any of the following is true:
 * - It is being inserted
 * - It is being restored
 * - It is being edited
 * - The ID it is associated with is being changed
 *
 * May be conservative by returning more removed roots than strictly necessary.
 *
 * Will never return IDs for non-root trees, even if they are removed.
 *
 * @param change - The change to be applied.
 */
export function relevantRemovedRoots(
	taggedChange: TaggedChange<ModularChangeset>,
): Iterable<DeltaDetachedNodeId> {
	return relevantModularRemovedRoots(taggedChange, fieldKinds);
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
	 *
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

	public constructor(
		family: ChangeFamily<ChangeFamilyEditor, DefaultChangeset>,
		changeReceiver: (change: DefaultChangeset) => void,
	) {
		this.modularBuilder = new ModularEditBuilder(family, changeReceiver);
	}

	public enterTransaction(): void {
		this.modularBuilder.enterTransaction();
	}
	public exitTransaction(): void {
		this.modularBuilder.exitTransaction();
	}

	public apply(change: DefaultChangeset): void {
		this.modularBuilder.apply(change);
	}

	public addNodeExistsConstraint(path: UpPath): void {
		this.modularBuilder.addNodeExistsConstraint(path);
	}

	public valueField(field: FieldUpPath): ValueFieldEditBuilder {
		return {
			set: (newContent: ITreeCursor): void => {
				const fillId = this.modularBuilder.generateId();

				const build = this.modularBuilder.buildTrees(fillId, [newContent]);
				const change: FieldChangeset = brand(
					valueFieldKind.changeHandler.editor.set({
						fill: fillId,
						detach: this.modularBuilder.generateId(),
					}),
				);

				const edit: FieldEditDescription = {
					type: "field",
					field,
					fieldKind: valueFieldKind.identifier,
					change,
				};
				this.modularBuilder.submitChanges([build, edit]);
			},
		};
	}

	public optionalField(field: FieldUpPath): OptionalFieldEditBuilder {
		return {
			set: (newContent: ITreeCursor | undefined, wasEmpty: boolean): void => {
				const detachId = this.modularBuilder.generateId();
				let fillId: ChangesetLocalId | undefined;
				const edits: EditDescription[] = [];
				let optionalChange: OptionalChangeset;
				if (newContent !== undefined) {
					fillId = this.modularBuilder.generateId();
					const build = this.modularBuilder.buildTrees(fillId, [newContent]);
					edits.push(build);

					optionalChange = optional.changeHandler.editor.set(wasEmpty, {
						fill: fillId,
						detach: detachId,
					});
				} else {
					optionalChange = optional.changeHandler.editor.clear(wasEmpty, detachId);
				}

				const change: FieldChangeset = brand(optionalChange);
				const edit: FieldEditDescription = {
					type: "field",
					field,
					fieldKind: optional.identifier,
					change,
				};
				edits.push(edit);

				this.modularBuilder.submitChanges(
					edits,
					newContent === undefined ? detachId : fillId,
				);
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
							0x801 /* Invalid move: the destination is below one of the moved elements. */,
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
						type: "field",
						field: sourceField,
						fieldKind: sequence.identifier,
						change: brand(moveOut),
					},
					{
						type: "field",
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
				const build = this.modularBuilder.buildTrees(firstId, content);
				const change: FieldChangeset = brand(
					sequence.changeHandler.editor.insert(index, length, firstId),
				);
				const attach: FieldEditDescription = {
					type: "field",
					field,
					fieldKind: sequence.identifier,
					change,
				};
				// The changes have to be submitted together, otherwise they will be assigned different revisions,
				// which will prevent the build ID and the insert ID from matching.
				this.modularBuilder.submitChanges(
					[build, attach],
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
