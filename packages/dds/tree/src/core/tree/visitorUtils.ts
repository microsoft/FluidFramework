/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";

import type { CodecWriteOptions } from "../../codec/index.js";
import { type IdAllocator, idAllocatorFromMaxId } from "../../util/index.js";
import type { RevisionTag, RevisionTagCodec } from "../rebase/index.js";
import type { FieldKey } from "../schema-stored/index.js";

import type { ITreeCursorSynchronous } from "./cursor.js";
import type { DetachedNodeId, Root } from "./delta.js";
import { DetachedFieldIndex } from "./detachedFieldIndex.js";
import type { ForestRootId } from "./detachedFieldIndexTypes.js";
import type { PlaceIndex, Range } from "./pathTree.js";
import { type DeltaVisitor, visitDelta } from "./visitDelta.js";

export function makeDetachedFieldIndex(
	prefix: string = "Temp",
	revisionTagCodec: RevisionTagCodec,
	idCompressor: IIdCompressor,
	options?: CodecWriteOptions,
): DetachedFieldIndex {
	return new DetachedFieldIndex(
		prefix,
		idAllocatorFromMaxId() as IdAllocator<ForestRootId>,
		revisionTagCodec,
		idCompressor,
		options,
	);
}

export function applyDelta(
	delta: Root,
	latestRevision: RevisionTag | undefined,
	deltaProcessor: { acquireVisitor: () => DeltaVisitor },
	detachedFieldIndex: DetachedFieldIndex,
): void {
	const visitor = deltaProcessor.acquireVisitor();
	visitDelta(delta, visitor, detachedFieldIndex, latestRevision);
	visitor.free();
}

export function announceDelta(
	delta: Root,
	latestRevision: RevisionTag | undefined,
	deltaProcessor: { acquireVisitor: () => DeltaVisitor & AnnouncedVisitor },
	detachedFieldIndex: DetachedFieldIndex,
): void {
	const visitor = deltaProcessor.acquireVisitor();
	visitDelta(delta, combineVisitors([visitor]), detachedFieldIndex, latestRevision);
	visitor.free();
}

export interface CombinedVisitor extends DeltaVisitor {
	readonly type: "Combined";

	readonly visitors: readonly CombinableVisitor[];
}

export type CombinableVisitor =
	| (DeltaVisitor & { type?: never })
	| AnnouncedVisitor
	| CombinedVisitor;

/**
 * Combines multiple visitors into a single visitor.
 * @param visitors - The returned visitor invokes the corresponding events for all these visitors, in order.
 * @returns a DeltaVisitor combining all `visitors`.
 */
export function combineVisitors(visitors: readonly CombinableVisitor[]): CombinedVisitor {
	const allVisitors = visitors.flatMap((v) => (v.type === "Combined" ? v.visitors : [v]));
	const announcedVisitors = allVisitors.filter(
		(v): v is AnnouncedVisitor => v.type === "Announced",
	);
	return {
		type: "Combined",
		visitors: allVisitors,
		free: () => visitors.forEach((v) => v.free()),
		create: (...args) => {
			allVisitors.forEach((v) => v.create(...args));
			announcedVisitors.forEach((v) => v.afterCreate(...args));
		},
		destroy: (...args) => {
			announcedVisitors.forEach((v) => v.beforeDestroy(...args));
			allVisitors.forEach((v) => v.destroy(...args));
		},
		attach: (source: FieldKey, count: number, destination: PlaceIndex) => {
			announcedVisitors.forEach((v) => v.beforeAttach(source, count, destination));
			allVisitors.forEach((v) => v.attach(source, count, destination));
			announcedVisitors.forEach((v) =>
				v.afterAttach(source, {
					start: destination,
					end: destination + count,
				}),
			);
		},
		detach: (
			source: Range,
			destination: FieldKey,
			id: DetachedNodeId,
			isReplaced: boolean,
		) => {
			announcedVisitors.forEach((v) => v.beforeDetach(source, destination, isReplaced));
			allVisitors.forEach((v) => v.detach(source, destination, id, isReplaced));
			announcedVisitors.forEach((v) =>
				v.afterDetach(source.start, source.end - source.start, destination, isReplaced),
			);
		},
		enterNode: (...args) => allVisitors.forEach((v) => v.enterNode(...args)),
		exitNode: (...args) => allVisitors.forEach((v) => v.exitNode(...args)),
		enterField: (...args) => allVisitors.forEach((v) => v.enterField(...args)),
		exitField: (...args) => allVisitors.forEach((v) => v.exitField(...args)),
	};
}

/**
 * Visitor that is notified of changes before, after, and when changes are made.
 * Must be freed after use.
 */
export interface AnnouncedVisitor extends DeltaVisitor {
	readonly type: "Announced";
	/**
	 * A hook that is called after all nodes have been created.
	 */
	afterCreate(content: readonly ITreeCursorSynchronous[], destination: FieldKey): void;
	beforeDestroy(field: FieldKey, count: number): void;
	beforeAttach(source: FieldKey, count: number, destination: PlaceIndex): void;
	afterAttach(source: FieldKey, destination: Range): void;
	beforeDetach(source: Range, destination: FieldKey, isReplaced: boolean): void;
	afterDetach(
		source: PlaceIndex,
		count: number,
		destination: FieldKey,
		isReplaced: boolean,
	): void;
}

/**
 * Creates an announced visitor with only the provided functions and uses a no op for the rest.
 * This is provided to make some of the delta visitor definitions cleaner.
 */
export function createAnnouncedVisitor(
	visitorFunctions: Partial<AnnouncedVisitor>,
): AnnouncedVisitor {
	const noOp = (): void => {};
	return {
		type: "Announced",
		free: visitorFunctions.free ?? noOp,
		create: visitorFunctions.create ?? noOp,
		afterCreate: visitorFunctions.afterCreate ?? noOp,
		beforeDestroy: visitorFunctions.beforeDestroy ?? noOp,
		destroy: visitorFunctions.destroy ?? noOp,
		beforeAttach: visitorFunctions.beforeAttach ?? noOp,
		attach: visitorFunctions.attach ?? noOp,
		afterAttach: visitorFunctions.afterAttach ?? noOp,
		beforeDetach: visitorFunctions.beforeDetach ?? noOp,
		detach: visitorFunctions.detach ?? noOp,
		afterDetach: visitorFunctions.afterDetach ?? noOp,
		enterNode: visitorFunctions.enterNode ?? noOp,
		exitNode: visitorFunctions.exitNode ?? noOp,
		enterField: visitorFunctions.enterField ?? noOp,
		exitField: visitorFunctions.exitField ?? noOp,
	};
}
