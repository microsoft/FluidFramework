/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Breakable, type IdAllocator, idAllocatorFromMaxId } from "../../util/index.js";
import type { RevisionTag } from "../rebase/index.js";
import type { FieldKey } from "../schema-stored/index.js";

import type { ITreeCursorSynchronous } from "./cursor.js";
import type { DetachedNodeId, Root } from "./delta.js";
import { DetachedFieldIndex } from "./detachedFieldIndex.js";
import type { ForestRootId } from "./detachedFieldIndexTypes.js";
import type { PlaceIndex, Range } from "./pathTree.js";
import { type DeltaVisitor, visitDelta } from "./visitDelta.js";

export function makeDetachedFieldIndex(prefix: string = "Temp"): DetachedFieldIndex {
	return new DetachedFieldIndex(prefix, idAllocatorFromMaxId() as IdAllocator<ForestRootId>);
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

export interface CombinedVisitor extends DeltaVisitor {
	readonly type: "Combined";

	readonly visitors: readonly CombinableVisitor[];
}

/**
 * A visitor accepted by {@link combineVisitors}.
 *
 * @remarks
 * Plain {@link DeltaVisitor}s are intersected with `{ readonly type?: never }` so this forms a
 * discriminated union with {@link AnnouncedVisitor} and {@link CombinedVisitor}. The optional
 * `never` property permits visitors without a `type`, while preventing a visitor with an unknown
 * or widened `type` from being treated as plain and losing its specialized composition behavior.
 */
export type CombinableVisitor =
	| (DeltaVisitor & { type?: never })
	| AnnouncedVisitor
	| CombinedVisitor;

/**
 * Wraps a visitor so any error breaks the supplied scope and all subsequent calls fail.
 *
 * @remarks
 * The `{ readonly type?: never }` intersection restricts this helper to plain visitors. Wrapping
 * an {@link AnnouncedVisitor} or {@link CombinedVisitor} as a plain visitor would hide its `type`
 * discriminator and prevent {@link combineVisitors} from preserving announced-event ordering or
 * flattening nested combined visitors.
 */
export function makeBreakingVisitor(
	visitor: DeltaVisitor & { readonly type?: never },
	breaker: Breakable,
): DeltaVisitor & { readonly type?: never } {
	return {
		free: () => breaker.run(() => visitor.free()),
		create: (...args) => breaker.run(() => visitor.create(...args)),
		destroy: (...args) => breaker.run(() => visitor.destroy(...args)),
		attach: (...args) => breaker.run(() => visitor.attach(...args)),
		detach: (...args) => breaker.run(() => visitor.detach(...args)),
		enterNode: (...args) => breaker.run(() => visitor.enterNode(...args)),
		exitNode: (...args) => breaker.run(() => visitor.exitNode(...args)),
		enterField: (...args) => breaker.run(() => visitor.enterField(...args)),
		exitField: (...args) => breaker.run(() => visitor.exitField(...args)),
		fieldMarks: (...args) => breaker.run(() => visitor.fieldMarks?.(...args)),
	};
}

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
		free: () => {
			for (const v of visitors) {
				v.free();
			}
		},
		create: (...args) => {
			for (const v of allVisitors) {
				v.create(...args);
			}
			for (const v of announcedVisitors) {
				v.afterCreate(...args);
			}
		},
		destroy: (...args) => {
			for (const v of announcedVisitors) {
				v.beforeDestroy(...args);
			}
			for (const v of allVisitors) {
				v.destroy(...args);
			}
		},
		attach: (source: FieldKey, count: number, destination: PlaceIndex) => {
			for (const v of announcedVisitors) {
				v.beforeAttach(source, count, destination);
			}
			for (const v of allVisitors) {
				v.attach(source, count, destination);
			}
			for (const v of announcedVisitors) {
				v.afterAttach(source, {
					start: destination,
					end: destination + count,
				});
			}
		},
		detach: (
			source: Range,
			destination: FieldKey,
			id: DetachedNodeId,
			isReplaced: boolean,
		) => {
			for (const v of announcedVisitors) {
				v.beforeDetach(source, destination, isReplaced);
			}
			for (const v of allVisitors) {
				v.detach(source, destination, id, isReplaced);
			}
			for (const v of announcedVisitors) {
				v.afterDetach(source.start, source.end - source.start, destination, isReplaced);
			}
		},
		enterNode: (...args) => {
			for (const v of allVisitors) {
				v.enterNode(...args);
			}
		},
		exitNode: (...args) => {
			for (const v of allVisitors) {
				v.exitNode(...args);
			}
		},
		enterField: (...args) => {
			for (const v of allVisitors) {
				v.enterField(...args);
			}
		},
		exitField: (...args) => {
			for (const v of allVisitors) {
				v.exitField(...args);
			}
		},
		fieldMarks: (marks) => {
			for (const v of allVisitors) {
				v.fieldMarks?.(marks);
			}
		},
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

const noOp = (): void => {};

/**
 * Creates an announced visitor with only the provided functions and uses a no op for the rest.
 * This is provided to make some of the delta visitor definitions cleaner.
 */
export function createAnnouncedVisitor(
	visitorFunctions: Partial<AnnouncedVisitor>,
): AnnouncedVisitor {
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
