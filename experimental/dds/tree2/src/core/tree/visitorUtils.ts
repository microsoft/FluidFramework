/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey } from "../schema-stored";
import * as Delta from "./delta";
import {
	DetachedPlaceUpPath,
	DetachedRangeUpPath,
	NodeIndex,
	PlaceIndex,
	Range,
	RangeUpPath,
} from "./pathTree";
import { ForestRootId, TreeIndex } from "./treeIndex";
import { ReplaceKind } from "./visitPath";
import { IdAllocator, idAllocatorFromMaxId } from "../../feature-libraries";
import { DeltaVisitor, visitDelta } from "./visitDelta";
import { brand } from "../../util";

export function applyDelta(
	delta: Delta.Root,
	deltaProcessor: { acquireVisitor: () => DeltaVisitor },
	treeIndex?: TreeIndex,
): void {
	const visitor = deltaProcessor.acquireVisitor();
	visitDelta(
		delta,
		visitor,
		treeIndex ??
			new TreeIndex("Temp", idAllocatorFromMaxId() as unknown as IdAllocator<ForestRootId>),
	);
	visitor.free();
}

export function announceDelta(
	delta: Delta.Root,
	deltaProcessor: { acquireVisitor: () => AnnouncedVisitor },
	treeIndex?: TreeIndex,
): void {
	const visitor = announceVisitor(deltaProcessor.acquireVisitor());
	visitDelta(
		delta,
		visitor,
		treeIndex ??
			new TreeIndex("Temp", idAllocatorFromMaxId() as unknown as IdAllocator<ForestRootId>),
	);
	visitor.free();
}

export function combineVisitors(visitors: readonly DeltaVisitor[]): DeltaVisitor {
	return {
		free: () => visitors.forEach((v) => v.free()),
		create: (...args) => visitors.forEach((v) => v.create(...args)),
		destroy: (...args) => visitors.forEach((v) => v.destroy(...args)),
		attach: (...args) => visitors.forEach((v) => v.attach(...args)),
		detach: (...args) => visitors.forEach((v) => v.detach(...args)),
		replace: (...args) => visitors.forEach((v) => v.replace(...args)),
		enterNode: (...args) => visitors.forEach((v) => v.enterNode(...args)),
		exitNode: (...args) => visitors.forEach((v) => v.exitNode(...args)),
		enterField: (...args) => visitors.forEach((v) => v.enterField(...args)),
		exitField: (...args) => visitors.forEach((v) => v.exitField(...args)),
	};
}

export function announceVisitor(visitor: AnnouncedVisitor): DeltaVisitor {
	return {
		free: () => visitor.free(),
		create: (index: PlaceIndex, content: Delta.ProtoNodes) => {
			visitor.create(index, content);
			visitor.afterCreate({ start: index, end: index + content.length }, content);
		},
		destroy: (...args) => {
			visitor.beforeDestroy(...args);
			visitor.destroy(...args);
		},
		replace: (
			newContentSource: DetachedRangeUpPath,
			oldContent: Range,
			oldContentDestination: DetachedPlaceUpPath,
			kind: ReplaceKind,
		) => {
			visitor.beforeReplace(newContentSource, oldContent, oldContentDestination, kind);
			visitor.replace(newContentSource, oldContent, oldContentDestination, kind);
			visitor.afterReplace(
				brand({
					field: newContentSource.field,
					index: newContentSource.start,
				}),
				{
					start: oldContent.start,
					end: oldContent.start + newContentSource.end - newContentSource.start,
				},
				brand({
					field: oldContentDestination.field,
					start: oldContentDestination.index,
					end: oldContentDestination.index + oldContent.end - oldContent.start,
				}),
				kind,
			);
		},
		attach: (source: DetachedRangeUpPath, destination: PlaceIndex) => {
			visitor.beforeAttach(source, destination);
			visitor.attach(source, destination);
			visitor.afterAttach(
				brand({
					field: source.field,
					index: source.start,
				}),
				{
					start: destination,
					end: destination + source.end - source.start,
				},
			);
		},
		detach: (source: Range, destination: DetachedPlaceUpPath) => {
			visitor.beforeDetach(source, destination);
			visitor.detach(source, destination);
			visitor.afterDetach(
				source.start,
				brand({
					field: destination.field,
					start: destination.index,
					end: destination.index + source.end - source.start,
				}),
			);
		},
		enterNode: (...args) => visitor.enterNode(...args),
		exitNode: (...args) => visitor.exitNode(...args),
		enterField: (...args) => visitor.enterField(...args),
		exitField: (...args) => visitor.exitField(...args),
	};
}

/**
 * Visitor that is notified of changes before, after, and when changes are made.
 * Must be freed after use.
 * @alpha
 */
export interface AnnouncedVisitor extends DeltaVisitor {
	afterCreate(range: Range, content: Delta.ProtoNodes): void;
	beforeDestroy(range: Range): void;
	beforeAttach(source: DetachedRangeUpPath, destination: PlaceIndex): void;
	afterAttach(source: DetachedPlaceUpPath, destination: Range): void;
	beforeDetach(source: Range, destination: DetachedPlaceUpPath): void;
	afterDetach(source: PlaceIndex, destination: DetachedRangeUpPath): void;
	beforeReplace(
		newContent: DetachedRangeUpPath,
		oldContent: Range,
		oldContentDestination: DetachedPlaceUpPath,
		kind: ReplaceKind,
	): void;
	afterReplace(
		newContentSource: DetachedPlaceUpPath,
		newContent: Range,
		oldContent: DetachedRangeUpPath,
		kind: ReplaceKind,
	): void;
}
