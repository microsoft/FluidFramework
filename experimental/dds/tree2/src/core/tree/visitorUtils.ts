/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IdAllocator, idAllocatorFromMaxId } from "../../util";
import { FieldKey } from "../schema-stored";
import { ICodecOptions } from "../../codec";
import * as Delta from "./delta";
import { PlaceIndex, Range } from "./pathTree";
import { ForestRootId, DetachedFieldIndex } from "./detachedFieldIndex";
import { DeltaVisitor, visitDelta } from "./visitDelta";

export function makeDetachedFieldIndex(
	prefix: string = "Temp",
	options?: ICodecOptions,
): DetachedFieldIndex {
	return new DetachedFieldIndex(
		prefix,
		idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
		options,
	);
}

export function applyDelta(
	delta: Delta.Root,
	deltaProcessor: { acquireVisitor: () => DeltaVisitor },
	detachedFieldIndex: DetachedFieldIndex,
): void {
	const visitor = deltaProcessor.acquireVisitor();
	visitDelta(delta, visitor, detachedFieldIndex);
	visitor.free();
}

export function announceDelta(
	delta: Delta.Root,
	deltaProcessor: { acquireVisitor: () => DeltaVisitor & AnnouncedVisitor },
	detachedFieldIndex: DetachedFieldIndex,
): void {
	const visitor = deltaProcessor.acquireVisitor();
	visitDelta(delta, combineVisitors([visitor], [visitor]), detachedFieldIndex);
	visitor.free();
}

export function combineVisitors(
	visitors: readonly DeltaVisitor[],
	announceVisitors: readonly AnnouncedVisitor[] = [],
): DeltaVisitor {
	return {
		free: () => visitors.forEach((v) => v.free()),
		create: (...args) => {
			visitors.forEach((v) => v.create(...args));
			announceVisitors.forEach((v) => v.afterCreate(...args));
		},
		destroy: (...args) => {
			announceVisitors.forEach((v) => v.beforeDestroy(...args));
			visitors.forEach((v) => v.destroy(...args));
		},
		attach: (source: FieldKey, count: number, destination: PlaceIndex) => {
			announceVisitors.forEach((v) => v.beforeAttach(source, count, destination));
			visitors.forEach((v) => v.attach(source, count, destination));
			announceVisitors.forEach((v) =>
				v.afterAttach(source, { start: destination, end: destination + count }),
			);
		},
		detach: (source: Range, destination: FieldKey) => {
			announceVisitors.forEach((v) => v.beforeDetach(source, destination));
			visitors.forEach((v) => v.detach(source, destination));
			announceVisitors.forEach((v) =>
				v.afterDetach(source.start, source.end - source.start, destination),
			);
		},
		replace: (newContent: FieldKey, oldContent: Range, oldContentDestination: FieldKey) => {
			announceVisitors.forEach((v) =>
				v.beforeReplace(newContent, oldContent, oldContentDestination),
			);
			visitors.forEach((v) => v.replace(newContent, oldContent, oldContentDestination));
			announceVisitors.forEach((v) =>
				v.afterReplace(newContent, oldContent, oldContentDestination),
			);
		},
		enterNode: (...args) => visitors.forEach((v) => v.enterNode(...args)),
		exitNode: (...args) => visitors.forEach((v) => v.exitNode(...args)),
		enterField: (...args) => visitors.forEach((v) => v.enterField(...args)),
		exitField: (...args) => visitors.forEach((v) => v.exitField(...args)),
	};
}

/**
 * Visitor that is notified of changes before, after, and when changes are made.
 * Must be freed after use.
 * @alpha
 */
export interface AnnouncedVisitor {
	/**
	 * A hook that is called after all nodes have been created.
	 */
	afterCreate(content: Delta.ProtoNodes, destination: FieldKey): void;
	beforeDestroy(field: FieldKey, count: number): void;
	beforeAttach(source: FieldKey, count: number, destination: PlaceIndex): void;
	afterAttach(source: FieldKey, destination: Range): void;
	beforeDetach(source: Range, destination: FieldKey): void;
	afterDetach(source: PlaceIndex, count: number, destination: FieldKey): void;
	beforeReplace(newContent: FieldKey, oldContent: Range, oldContentDestination: FieldKey): void;
	afterReplace(newContentSource: FieldKey, newContent: Range, oldContent: FieldKey): void;
}
