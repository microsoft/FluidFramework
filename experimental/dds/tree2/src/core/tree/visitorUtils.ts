/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IdAllocator, idAllocatorFromMaxId } from "../../util";
import { FieldKey } from "../schema-stored";
import * as Delta from "./delta";
import { PlaceIndex, Range } from "./pathTree";
import { ForestRootId, DetachedFieldIndex } from "./detachedFieldIndex";
import { ReplaceKind } from "./visitPath";
import { DeltaVisitor, visitDelta } from "./visitDelta";

export function makeDetachedFieldIndex(prefix: string = "Temp"): DetachedFieldIndex {
	return new DetachedFieldIndex(prefix, idAllocatorFromMaxId() as IdAllocator<ForestRootId>);
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
	deltaProcessor: { acquireVisitor: () => AnnouncedVisitor },
	detachedFieldIndex: DetachedFieldIndex,
): void {
	const visitor = announceVisitor(deltaProcessor.acquireVisitor());
	visitDelta(delta, visitor, detachedFieldIndex);
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
		create: (...args) => {
			visitor.create(...args);
			visitor.afterCreate(...args);
		},
		destroy: (...args) => {
			visitor.beforeDestroy(...args);
			visitor.destroy(...args);
		},
		replace: (...args) => {
			visitor.beforeReplace(...args);
			visitor.replace(...args);
			visitor.afterReplace(...args);
		},
		attach: (source: FieldKey, count: number, destination: PlaceIndex) => {
			visitor.beforeAttach(source, count, destination);
			visitor.attach(source, count, destination);
			visitor.afterAttach(source, {
				start: destination,
				end: destination + count,
			});
		},
		detach: (source: Range, destination: FieldKey) => {
			visitor.beforeDetach(source, destination);
			visitor.detach(source, destination);
			visitor.afterDetach(source.start, source.end - source.start, destination);
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
	/**
	 * A hook that is called after all nodes have been created.
	 */
	afterCreate(content: Delta.ProtoNodes, destination: FieldKey): void;
	beforeDestroy(field: FieldKey, count: number): void;
	beforeAttach(source: FieldKey, count: number, destination: PlaceIndex): void;
	afterAttach(source: FieldKey, destination: Range): void;
	beforeDetach(source: Range, destination: FieldKey): void;
	afterDetach(source: PlaceIndex, count: number, destination: FieldKey): void;
	beforeReplace(
		newContent: FieldKey,
		oldContent: Range,
		oldContentDestination: FieldKey,
		kind: ReplaceKind,
	): void;
	afterReplace(
		newContentSource: FieldKey,
		newContent: Range,
		oldContent: FieldKey,
		kind: ReplaceKind,
	): void;
}
