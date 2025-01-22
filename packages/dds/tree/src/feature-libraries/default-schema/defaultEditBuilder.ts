/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { ICodecFamily } from "../../codec/index.js";
import {
	type ChangeAtomId,
	type ChangeEncodingContext,
	type ChangeFamily,
	type ChangeFamilyEditor,
	type ChangeRebaser,
	CursorLocationType,
	type DeltaDetachedNodeId,
	type DeltaRoot,
	type FieldUpPath,
	type ITreeCursorSynchronous,
	type RevisionTag,
	type TaggedChange,
	type UpPath,
	compareFieldUpPaths,
	topDownPath,
} from "../../core/index.js";
import { brand } from "../../util/index.js";
import {
	type EditDescription,
	type FieldChangeset,
	type FieldEditDescription,
	ModularChangeFamily,
	type ModularChangeset,
	ModularEditBuilder,
	intoDelta as intoModularDelta,
	relevantRemovedRoots as relevantModularRemovedRoots,
} from "../modular-schema/index.js";
import type { OptionalChangeset } from "../optional-field/index.js";

import {
	fieldKinds,
	optional,
	sequence,
	required as valueFieldKind,
} from "./defaultFieldKinds.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { CellId } from "../sequence-field/index.js";

export type DefaultChangeset = ModularChangeset;

/**
 * Implementation of {@link ChangeFamily} based on the default set of supported field kinds.
 *
 * @sealed
 */
export class DefaultChangeFamily
	implements ChangeFamily<DefaultEditBuilder, DefaultChangeset>
{
	private readonly modularFamily: ModularChangeFamily;

	public constructor(codecs: ICodecFamily<ModularChangeset, ChangeEncodingContext>) {
		this.modularFamily = new ModularChangeFamily(fieldKinds, codecs);
	}

	public get rebaser(): ChangeRebaser<DefaultChangeset> {
		return this.modularFamily.rebaser;
	}

	public get codecs(): ICodecFamily<DefaultChangeset, ChangeEncodingContext> {
		return this.modularFamily.codecs;
	}

	public buildEditor(
		mintRevisionTag: () => RevisionTag,
		changeReceiver: (change: TaggedChange<DefaultChangeset>) => void,
	): DefaultEditBuilder {
		return new DefaultEditBuilder(this, mintRevisionTag, changeReceiver);
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
export function relevantRemovedRoots(change: ModularChangeset): Iterable<DeltaDetachedNodeId> {
	return relevantModularRemovedRoots(change, fieldKinds);
}

/**
 * Default editor for transactional tree data changes.
 * @privateRemarks
 * When taking into account not just the content of the tree,
 * but also how the merge identities (and thus anchors, flex-tree and simple-tree nodes) of nodes before and after the edits correspond,
 * some edits are currently impossible to express.
 * Examples of these non-expressible edits include:
 *
 * - Changing the type of a node while keeping its merge identity.
 * - Changing the value of a leaf while keeping its merge identity.
 * - Swapping subtrees between two value fields.
 * - Replacing a node in the middle of a tree while reusing some of the old nodes decedents that were under value fields.
 *
 * At some point it will likely be worth supporting at least some of these, possibly using a mechanism that could support all of them if desired.
 * If/when such a mechanism becomes available, an evaluation should be done to determine if any existing editing operations should be changed to leverage it
 * (Possibly by adding opt ins at the view schema layer).
 */
export interface IDefaultEditBuilder {
	/**
	 * @param field - the value field which is being edited under the parent node
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	valueField(field: FieldUpPath): ValueFieldEditBuilder<ITreeCursorSynchronous>;

	/**
	 * @param field - the optional field which is being edited under the parent node
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	optionalField(field: FieldUpPath): OptionalFieldEditBuilder<ITreeCursorSynchronous>;

	/**
	 * @param field - the sequence field which is being edited under the parent node
	 *
	 * @returns An object with methods to edit the given field of the given parent.
	 * The returned object can be used (i.e., have its methods called) multiple times but its lifetime
	 * is bounded by the lifetime of this edit builder.
	 */
	sequenceField(field: FieldUpPath): SequenceFieldEditBuilder<ITreeCursorSynchronous>;

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

	/**
	 * Add a constraint that the node at the given path must exist.
	 * @param path - The path to the node that must exist.
	 */
	addNodeExistsConstraint(path: UpPath): void;

	/**
	 * Add a constraint that the node at the given path must exist when reverting a change.
	 * @param path - The path to the node that must exist when reverting a change.
	 */
	addNodeExistsConstraintOnRevert(path: UpPath): void;
}

/**
 * Implementation of {@link IDefaultEditBuilder} based on the default set of supported field kinds.
 * @sealed
 */
export class DefaultEditBuilder implements ChangeFamilyEditor, IDefaultEditBuilder {
	private readonly modularBuilder: ModularEditBuilder;

	public constructor(
		family: ChangeFamily<ChangeFamilyEditor, DefaultChangeset>,
		private readonly mintRevisionTag: () => RevisionTag,
		changeReceiver: (change: TaggedChange<DefaultChangeset>) => void,
		private readonly idCompressor?: IIdCompressor,
	) {
		this.modularBuilder = new ModularEditBuilder(family, fieldKinds, changeReceiver);
	}

	public enterTransaction(): void {
		this.modularBuilder.enterTransaction();
	}
	public exitTransaction(): void {
		this.modularBuilder.exitTransaction();
	}

	public addNodeExistsConstraint(path: UpPath): void {
		this.modularBuilder.addNodeExistsConstraint(path, this.mintRevisionTag());
	}

	public addNodeExistsConstraintOnRevert(path: UpPath): void {
		this.modularBuilder.addNodeExistsConstraintOnRevert(path, this.mintRevisionTag());
	}

	public valueField(field: FieldUpPath): ValueFieldEditBuilder<ITreeCursorSynchronous> {
		return {
			set: (newContent: ITreeCursorSynchronous): void => {
				const revision = this.mintRevisionTag();
				const fill: ChangeAtomId = { localId: this.modularBuilder.generateId(), revision };
				const detach: ChangeAtomId = { localId: this.modularBuilder.generateId(), revision };
				const build = this.modularBuilder.buildTrees(
					fill.localId,
					newContent,
					revision,
					this.idCompressor,
				);
				const change: FieldChangeset = brand(
					valueFieldKind.changeHandler.editor.set({
						fill,
						detach,
					}),
				);

				const edit: FieldEditDescription = {
					type: "field",
					field,
					fieldKind: valueFieldKind.identifier,
					change,
					revision,
				};
				this.modularBuilder.submitChanges([build, edit], revision);
			},
		};
	}

	public optionalField(field: FieldUpPath): OptionalFieldEditBuilder<ITreeCursorSynchronous> {
		return {
			set: (newContent: ITreeCursorSynchronous | undefined, wasEmpty: boolean): void => {
				const edits: EditDescription[] = [];
				let optionalChange: OptionalChangeset;
				const revision = this.mintRevisionTag();
				const detach: ChangeAtomId = { localId: this.modularBuilder.generateId(), revision };
				if (newContent !== undefined) {
					const fill: ChangeAtomId = { localId: this.modularBuilder.generateId(), revision };
					const build = this.modularBuilder.buildTrees(
						fill.localId,
						newContent,
						revision,
						this.idCompressor,
					);
					edits.push(build);

					optionalChange = optional.changeHandler.editor.set(wasEmpty, {
						fill,
						detach,
					});
				} else {
					optionalChange = optional.changeHandler.editor.clear(wasEmpty, detach);
				}

				const change: FieldChangeset = brand(optionalChange);
				const edit: FieldEditDescription = {
					type: "field",
					field,
					fieldKind: optional.identifier,
					change,
					revision,
				};
				edits.push(edit);

				this.modularBuilder.submitChanges(edits, revision);
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
		if (count === 0) {
			return;
		} else if (count < 0 || !Number.isSafeInteger(count)) {
			throw new UsageError(`Expected non-negative integer count, got ${count}.`);
		}
		const revision = this.mintRevisionTag();
		const detachCellId = this.modularBuilder.generateId(count);
		const attachCellId: CellId = { localId: this.modularBuilder.generateId(count), revision };
		if (compareFieldUpPaths(sourceField, destinationField)) {
			const change = sequence.changeHandler.editor.move(
				sourceIndex,
				count,
				destIndex,
				detachCellId,
				attachCellId,
				revision,
			);
			this.modularBuilder.submitChange(
				sourceField,
				sequence.identifier,
				brand(change),
				revision,
			);
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
					} else if (sourceIndex + count <= attachAncestorIndex) {
						// The attach path runs through a node located after the detached nodes.
						// adjust the index for the node at that depth of the path, so that it is interpreted correctly
						// in the composition performed by `submitChanges`.
						attachAncestorIndex -= count;
						let parent: UpPath | undefined = attachPath[sharedDepth - 1];
						const parentField = attachPath[sharedDepth] ?? oob();
						parent = {
							parent,
							parentIndex: attachAncestorIndex,
							parentField: parentField.parentField,
						};
						for (let i = sharedDepth + 1; i < attachPath.length; i += 1) {
							parent = {
								...(attachPath[i] ?? oob()),
								parent,
							};
						}
						adjustedAttachField = { parent, field: destinationField.field };
					} else {
						throw new UsageError(
							"Invalid move operation: the destination is located under one of the moved elements. Consider using the Tree.contains API to detect this.",
						);
					}
				}
			}
			const moveOut = sequence.changeHandler.editor.remove(
				sourceIndex,
				count,
				detachCellId,
				revision,
			);
			const moveIn = sequence.changeHandler.editor.insert(
				destIndex,
				count,
				attachCellId,
				revision,
			);

			this.modularBuilder.submitChanges(
				[
					{
						type: "global",
						renames: [
							{
								count,
								oldId: { revision, localId: detachCellId },
								newId: attachCellId,
							},
						],
						revision,
					},
					{
						type: "field",
						field: sourceField,
						fieldKind: sequence.identifier,
						change: brand(moveOut),
						revision,
					},
					{
						type: "field",
						field: adjustedAttachField,
						fieldKind: sequence.identifier,
						change: brand(moveIn),
						revision,
					},
				],
				revision,
			);
		}
	}

	public sequenceField(field: FieldUpPath): SequenceFieldEditBuilder<ITreeCursorSynchronous> {
		return {
			insert: (index: number, content: ITreeCursorSynchronous): void => {
				const length =
					content.mode === CursorLocationType.Fields ? content.getFieldLength() : 1;
				if (length === 0) {
					return;
				}

				const revision = this.mintRevisionTag();
				const firstId: CellId = { localId: this.modularBuilder.generateId(length), revision };
				const build = this.modularBuilder.buildTrees(
					firstId.localId,
					content,
					revision,
					this.idCompressor,
				);
				const change: FieldChangeset = brand(
					sequence.changeHandler.editor.insert(index, length, firstId, revision),
				);
				const attach: FieldEditDescription = {
					type: "field",
					field,
					fieldKind: sequence.identifier,
					change,
					revision,
				};
				// The changes have to be submitted together, otherwise they will be assigned different revisions,
				// which will prevent the build ID and the insert ID from matching.
				this.modularBuilder.submitChanges([build, attach], revision);
			},
			remove: (index: number, count: number): void => {
				if (count === 0) {
					return;
				}
				const revision = this.mintRevisionTag();
				const id = this.modularBuilder.generateId(count);
				const change: FieldChangeset = brand(
					sequence.changeHandler.editor.remove(index, count, id, revision),
				);

				const fieldEdit: FieldEditDescription = {
					type: "field",
					field,
					fieldKind: sequence.identifier,
					change,
					revision,
				};
				this.modularBuilder.submitChanges([fieldEdit], revision);
			},
		};
	}
}

/**
 */
export interface ValueFieldEditBuilder<TContent> {
	/**
	 * Issues a change which replaces the current newContent of the field with `newContent`.
	 * @param newContent - the new content for the field.
	 * The cursor can be in either Field or Node mode and must represent exactly one node.
	 */
	set(newContent: TContent): void;
}

/**
 */
export interface OptionalFieldEditBuilder<TContent> {
	/**
	 * Issues a change which replaces the current newContent of the field with `newContent`
	 * @param newContent - the new content for the field.
	 * If provided, the cursor can be in either Field or Node mode and must represent exactly one node.
	 * @param wasEmpty - whether the field is empty when creating this change
	 */
	set(newContent: TContent | undefined, wasEmpty: boolean): void;
}

/**
 */
export interface SequenceFieldEditBuilder<TContent> {
	/**
	 * Issues a change which inserts the `newContent` at the given `index`.
	 * @param index - the index at which to insert the `newContent`.
	 * @param newContent - the new content to be inserted in the field. Cursor can be in either Field or Node mode.
	 */
	insert(index: number, newContent: TContent): void;

	/**
	 * Issues a change which removes `count` elements starting at the given `index`.
	 * @param index - The index of the first removed element.
	 * @param count - The number of elements to remove.
	 */
	remove(index: number, count: number): void;
}

/**
 * @returns The number of path elements that both paths share, starting at index 0.
 */
function getSharedPrefixLength(pathA: readonly UpPath[], pathB: readonly UpPath[]): number {
	const minDepth = Math.min(pathA.length, pathB.length);
	let sharedDepth = 0;
	while (sharedDepth < minDepth) {
		const detachStep = pathA[sharedDepth] ?? oob();
		const attachStep = pathB[sharedDepth] ?? oob();
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
