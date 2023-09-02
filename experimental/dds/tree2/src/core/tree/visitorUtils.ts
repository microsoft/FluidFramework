/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey } from "../schema-stored";
import * as Delta from "./delta";
import { DetachedPlaceUpPath, DetachedRangeUpPath, NodeIndex, PlaceIndex } from "./pathTree";
import { ForestRootId, TreeIndex } from "./treeIndex";
import { ReplaceKind } from "./visitPath";
import { IdAllocator, idAllocatorFromMaxId } from "../../feature-libraries";
import { DeltaVisitor, visitDelta } from "./visitDelta";

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

export function combineVisitors(visitors: readonly DeltaVisitor[]): DeltaVisitor {
	return {
		free: () => visitors.forEach((v) => v.free()),
		create: (...args) => visitors.forEach((v) => v.create(...args)),
		destroy: (...args) => visitors.forEach((v) => v.destroy(...args)),
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
	free(): void;
	afterCreate(index: DetachedPlaceUpPath, content: Delta.ProtoNodes): void;
	beforeDestroy(index: DetachedRangeUpPath): void;
	beforeReplace(
		newContentSource: DetachedRangeUpPath | undefined,
		oldContentIndex: PlaceIndex,
		oldContentCount: number,
		oldContentDestination: DetachedPlaceUpPath | undefined,
		kind: ReplaceKind,
	): void;
	afterReplace(
		newContentSource: DetachedRangeUpPath | undefined,
		oldContentIndex: PlaceIndex,
		oldContentCount: number,
		oldContentDestination: DetachedPlaceUpPath | undefined,
		kind: ReplaceKind,
	): void;
	enterNode(index: NodeIndex): void;
	exitNode(index: NodeIndex): void;
	enterField(key: FieldKey): void;
	exitField(key: FieldKey): void;
}
