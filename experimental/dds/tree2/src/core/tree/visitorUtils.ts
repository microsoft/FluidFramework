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
	const visitor = combineVisitors([deltaProcessor.acquireVisitor()]);
	visitDelta(delta, visitor, detachedFieldIndex);
	visitor.free();
}

function isDeltaVisitor(obj: any): obj is DeltaVisitor {
	return obj.create !== undefined;
}

function isAnnouncedVisitor(obj: any): obj is AnnouncedVisitor {
	return obj.afterCreate !== undefined;
}

export function combineVisitors(
	visitors: readonly (DeltaVisitor | AnnouncedVisitor)[],
): DeltaVisitor {
	return {
		free: () =>
			visitors.forEach((v) => {
				if (isDeltaVisitor(v)) {
					v.free();
				}
			}),
		create: (...args) =>
			visitors.forEach((v) => {
				if (isDeltaVisitor(v)) {
					v.create(...args);
				}
				if (isAnnouncedVisitor(v)) {
					v.afterCreate(...args);
				}
			}),
		destroy: (...args) =>
			visitors.forEach((v) => {
				if (isAnnouncedVisitor(v)) {
					v.beforeDestroy(...args);
				}
				if (isDeltaVisitor(v)) {
					v.destroy(...args);
				}
			}),
		attach: (source: FieldKey, count: number, destination: PlaceIndex) =>
			visitors.forEach((v) => {
				if (isAnnouncedVisitor(v)) {
					v.beforeAttach(source, count, destination);
				}
				if (isDeltaVisitor(v)) {
					v.attach(source, count, destination);
				}
				if (isAnnouncedVisitor(v)) {
					v.afterAttach(source, {
						start: destination,
						end: destination + count,
					});
				}
			}),
		detach: (source: Range, destination: FieldKey) =>
			visitors.forEach((v) => {
				if (isAnnouncedVisitor(v)) {
					v.beforeDetach(source, destination);
				}
				if (isDeltaVisitor(v)) {
					v.detach(source, destination);
				}
				if (isAnnouncedVisitor(v)) {
					v.afterDetach(source.start, source.end - source.start, destination);
				}
			}),
		replace: (
			newContent: FieldKey,
			oldContent: Range,
			oldContentDestination: FieldKey,
			kind: ReplaceKind,
		) =>
			visitors.forEach((v) => {
				if (isAnnouncedVisitor(v)) {
					v.beforeReplace(newContent, oldContent, oldContentDestination, kind);
				}
				if (isDeltaVisitor(v)) {
					v.replace(newContent, oldContent, oldContentDestination, kind);
				}
				if (isAnnouncedVisitor(v)) {
					v.afterReplace(newContent, oldContent, oldContentDestination, kind);
				}
			}),
		enterNode: (...args) =>
			visitors.forEach((v) => {
				if (isDeltaVisitor(v)) {
					v.enterNode(...args);
				}
			}),
		exitNode: (...args) =>
			visitors.forEach((v) => {
				if (isDeltaVisitor(v)) {
					v.exitNode(...args);
				}
			}),
		enterField: (...args) =>
			visitors.forEach((v) => {
				if (isDeltaVisitor(v)) {
					v.enterField(...args);
				}
			}),
		exitField: (...args) =>
			visitors.forEach((v) => {
				if (isDeltaVisitor(v)) {
					v.exitField(...args);
				}
			}),
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
