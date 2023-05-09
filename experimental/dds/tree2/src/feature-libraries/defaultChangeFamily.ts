/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodecFamily } from "../codec";
import {
	ChangeFamily,
	ChangeRebaser,
	FieldKindIdentifier,
	AnchorSet,
	Delta,
	UpPath,
	Value,
	ITreeCursor,
	RevisionTag,
	ChangeFamilyEditor,
	FieldUpPath,
} from "../core";
import { brand } from "../util";
import {
	FieldKind,
	ModularChangeFamily,
	ModularEditBuilder,
	FieldChangeset,
	ModularChangeset,
	NodeReviver,
} from "./modular-schema";
import { forbidden, optional, sequence, value as valueFieldKind } from "./defaultFieldKinds";

export type DefaultChangeset = ModularChangeset;

const defaultFieldKinds: ReadonlyMap<FieldKindIdentifier, FieldKind> = new Map(
	[valueFieldKind, optional, sequence, forbidden].map((f) => [f.identifier, f]),
);

/**
 * Implementation of {@link ChangeFamily} based on the default set of supported field kinds.
 *
 * @sealed
 */
export class DefaultChangeFamily implements ChangeFamily<DefaultEditBuilder, DefaultChangeset> {
	private readonly modularFamily: ModularChangeFamily;

	public constructor() {
		this.modularFamily = new ModularChangeFamily(defaultFieldKinds);
	}

	public get rebaser(): ChangeRebaser<DefaultChangeset> {
		return this.modularFamily.rebaser;
	}

	public get codecs(): ICodecFamily<DefaultChangeset> {
		return this.modularFamily.codecs;
	}

	public intoDelta(change: DefaultChangeset): Delta.Root {
		return this.modularFamily.intoDelta(change);
	}

	public buildEditor(
		changeReceiver: (change: DefaultChangeset) => void,
		anchorSet: AnchorSet,
	): DefaultEditBuilder {
		return new DefaultEditBuilder(this, changeReceiver, anchorSet);
	}
}

export const defaultChangeFamily = new DefaultChangeFamily();

/**
 * Default editor for transactions.
 * @alpha
 */
export interface IDefaultEditBuilder {
	// TODO: document
	setValue(path: UpPath, value: Value): void;

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

	// TODO: document
	move(
		sourceField: FieldUpPath,
		sourceIndex: number,
		count: number,
		destinationField: FieldUpPath,
		destIndex: number,
	): void;

	// TODO: document
	addValueConstraint(path: UpPath, value: Value): void;
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
		anchors: AnchorSet,
	) {
		this.modularBuilder = new ModularEditBuilder(family, changeReceiver, anchors);
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

	public setValue(path: UpPath, value: Value): void {
		this.modularBuilder.setValue(path, value);
	}

	public addValueConstraint(path: UpPath, value: Value): void {
		this.modularBuilder.addValueConstraint(path, value);
	}

	public valueField(field: FieldUpPath): ValueFieldEditBuilder {
		return {
			set: (newContent: ITreeCursor): void => {
				const change: FieldChangeset = brand(
					valueFieldKind.changeHandler.editor.set(newContent),
				);
				this.modularBuilder.submitChange(field, valueFieldKind.identifier, change);
			},
		};
	}

	public optionalField(field: FieldUpPath): OptionalFieldEditBuilder {
		return {
			set: (newContent: ITreeCursor | undefined, wasEmpty: boolean): void => {
				const change: FieldChangeset = brand(
					optional.changeHandler.editor.set(newContent, wasEmpty),
				);
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
		const changes = sequence.changeHandler.editor.move(
			sourceIndex,
			count,
			destIndex,
			this.modularBuilder.generateId(),
		);
		this.modularBuilder.submitChanges(
			[
				{
					field: sourceField,
					fieldKind: sequence.identifier,
					change: brand(changes[0]),
				},
				{
					field: destinationField,
					fieldKind: sequence.identifier,
					change: brand(changes[1]),
				},
			],
			brand(0),
		);
	}

	public sequenceField(field: FieldUpPath): SequenceFieldEditBuilder {
		return {
			insert: (index: number, newContent: ITreeCursor | ITreeCursor[]): void => {
				const change: FieldChangeset = brand(
					sequence.changeHandler.editor.insert(
						index,
						newContent,
						this.modularBuilder.generateId(
							Array.isArray(newContent) ? newContent.length : 1,
						),
					),
				);
				this.modularBuilder.submitChange(field, sequence.identifier, change);
			},
			delete: (index: number, count: number): void => {
				const change: FieldChangeset = brand(
					sequence.changeHandler.editor.delete(index, count),
				);
				this.modularBuilder.submitChange(field, sequence.identifier, change);
			},
			move: (sourceIndex: number, count: number, destIndex: number): void => {
				const moves = sequence.changeHandler.editor.move(
					sourceIndex,
					count,
					destIndex,
					this.modularBuilder.generateId(),
				);

				this.modularBuilder.submitChanges(
					[
						{
							field,
							fieldKind: sequence.identifier,
							change: brand(moves[0]),
						},
						{
							field,
							fieldKind: sequence.identifier,
							change: brand(moves[1]),
						},
					],
					brand(0),
				);
			},
			revive: (
				index: number,
				count: number,
				detachedBy: RevisionTag,
				reviver: NodeReviver,
				detachIndex: number,
				isIntention?: true,
			): void => {
				const change: FieldChangeset = brand(
					sequence.changeHandler.editor.revive(
						index,
						count,
						detachedBy,
						reviver,
						detachIndex,
						isIntention,
					),
				);
				this.modularBuilder.submitChange(field, sequence.identifier, change);
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
	 * @param newContent - the new content for the field
	 */
	set(newContent: ITreeCursor): void;
}

/**
 * @alpha
 */
export interface OptionalFieldEditBuilder {
	/**
	 * Issues a change which replaces the current newContent of the field with `newContent`
	 * @param newContent - the new content for the field
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
	 * @param newContent - the new content to be inserted in the field
	 */
	insert(index: number, newContent: ITreeCursor | ITreeCursor[]): void;

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
	 * @param destIndex - the index the elements are moved to, interpreted after removing the moving elements.
	 */
	move(sourceIndex: number, count: number, destIndex: number): void;

	/**
	 * Revives a contiguous range of deleted nodes.
	 * @param index - The index at which to revive the node (this will become the index of the first revived node).
	 * @param count - The number of nodes to revive.
	 * @param detachedBy - The revision of the edit that deleted the nodes.
	 * @param reviver - The NodeReviver used to retrieve repair data.
	 * @param detachIndex - The index of the first node to revive in the input context of edit `detachedBy`.
	 * @param isIntention - If true, the node will be revived even if edit `detachedBy` did not ultimately
	 * delete them. If false, only those nodes that were deleted by `detachedBy` (and not revived) will be revived.
	 */
	revive(
		index: number,
		count: number,
		detachedBy: RevisionTag,
		reviver: NodeReviver,
		detachIndex: number,
		isIntention?: true,
	): void;
}
