/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NormalizedFieldUpPath, NormalizedUpPath } from "../../core/index.js";

import type {
	IDefaultEditBuilder,
	OptionalFieldEditBuilder,
	SequenceFieldEditBuilder,
	ValueFieldEditBuilder,
} from "./defaultEditBuilder.js";

/**
 * An IDefaultEditBuilder implementation based on another IDefaultEditBuilder that uses a different content type for insertions.
 */
export class MappedEditBuilder<TBase, TAdapted> implements IDefaultEditBuilder<TAdapted> {
	public constructor(
		private readonly baseBuilder: IDefaultEditBuilder<TBase>,
		private readonly mapDelegate: (input: TAdapted) => TBase,
	) {}
	public valueField(field: NormalizedFieldUpPath): ValueFieldEditBuilder<TAdapted> {
		const baseField = this.baseBuilder.valueField(field);
		return {
			set: (newContent: TAdapted): void => {
				const mappedContent = this.mapDelegate(newContent);
				baseField.set(mappedContent);
			},
		};
	}
	public optionalField(field: NormalizedFieldUpPath): OptionalFieldEditBuilder<TAdapted> {
		const baseField = this.baseBuilder.optionalField(field);
		return {
			set: (newContent: TAdapted | undefined, wasEmpty: boolean): void => {
				const mappedContent =
					newContent === undefined ? undefined : this.mapDelegate(newContent);
				baseField.set(mappedContent, wasEmpty);
			},
		};
	}
	public sequenceField(field: NormalizedFieldUpPath): SequenceFieldEditBuilder<TAdapted> {
		const baseField = this.baseBuilder.sequenceField(field);
		return {
			insert: (index: number, content: TAdapted): void => {
				const mappedContent = this.mapDelegate(content);
				baseField.insert(index, mappedContent);
			},
			remove: (index: number, count: number): void => {
				baseField.remove(index, count);
			},
		};
	}
	public move(
		sourceField: NormalizedFieldUpPath,
		sourceIndex: number,
		count: number,
		destinationField: NormalizedFieldUpPath,
		destinationIndex: number,
	): void {
		this.baseBuilder.move(sourceField, sourceIndex, count, destinationField, destinationIndex);
	}
	public addNodeExistsConstraint(path: NormalizedUpPath): void {
		this.baseBuilder.addNodeExistsConstraint(path);
	}
	public addNodeExistsConstraintOnRevert(path: NormalizedUpPath): void {
		this.baseBuilder.addNodeExistsConstraintOnRevert(path);
	}
}
