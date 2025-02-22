/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ICodecOptions } from "../../codec/index.js";
import { type IdAllocator, idAllocatorFromMaxId } from "../../util/index.js";
import type { RevisionTag, RevisionTagCodec } from "../rebase/index.js";
import type { FieldKey } from "../schema-stored/index.js";

import type { ProtoNodes, Root } from "./delta.js";
import { DetachedFieldIndex } from "./detachedFieldIndex.js";
import type { ForestRootId } from "./detachedFieldIndexTypes.js";
import type { NodeIndex, PlaceIndex, Range } from "./pathTree.js";
import { type DeltaVisitor, visitDelta } from "./visitDelta.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

export function makeDetachedFieldIndex(
	prefix: string = "Temp",
	revisionTagCodec: RevisionTagCodec,
	idCompressor: IIdCompressor,
	options?: ICodecOptions,
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
	visitDelta(delta, combineVisitors([visitor], [visitor]), detachedFieldIndex, latestRevision);
	visitor.free();
}

/**
 * @param visitors - The returned visitor invokes the corresponding events for all these visitors, in order.
 * @param announcedVisitors - Subset of `visitors` to also call {@link AnnouncedVisitor} methods on.
 * This must be a subset of `visitors`: if not the visitor will not have its path correctly set when the events are triggered.
 * When `visitors` are making changes to data, `announcedVisitors` can be used to get extra events before or after all the changes from all the visitors have been made.
 * This can, for example, enable visitors to have access to the tree in these extra events despite multiple separate visitors updating different tree related data-structures.
 * @returns a DeltaVisitor combining all `visitors`.
 */
export function combineVisitors(
	visitors: readonly DeltaVisitor[],
	announcedVisitors: readonly AnnouncedVisitor[] = [],
): DeltaVisitor {
	{
		const set = new Set(visitors);
		for (const item of announcedVisitors) {
			assert(set.has(item), 0x8c8 /* AnnouncedVisitor would not get traversed */);
		}
	}
	return {
		free: () => visitors.forEach((v) => v.free()),
		create: (...args) => {
			visitors.forEach((v) => v.create(...args));
			announcedVisitors.forEach((v) => v.afterCreate(...args));
		},
		destroy: (...args) => {
			announcedVisitors.forEach((v) => v.beforeDestroy(...args));
			visitors.forEach((v) => v.destroy(...args));
		},
		attach: (source: FieldKey, count: number, destination: PlaceIndex) => {
			announcedVisitors.forEach((v) => v.beforeAttach(source, count, destination));
			visitors.forEach((v) => v.attach(source, count, destination));
			announcedVisitors.forEach((v) =>
				v.afterAttach(source, { start: destination, end: destination + count }),
			);
		},
		detach: (source: Range, destination: FieldKey) => {
			announcedVisitors.forEach((v) => v.beforeDetach(source, destination));
			visitors.forEach((v) => v.detach(source, destination));
			announcedVisitors.forEach((v) =>
				v.afterDetach(source.start, source.end - source.start, destination),
			);
		},
		replace: (newContent: FieldKey, oldContent: Range, oldContentDestination: FieldKey) => {
			announcedVisitors.forEach((v) =>
				v.beforeReplace(newContent, oldContent, oldContentDestination),
			);
			visitors.forEach((v) => v.replace(newContent, oldContent, oldContentDestination));
			announcedVisitors.forEach((v) =>
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
 */
export interface AnnouncedVisitor extends DeltaVisitor {
	/**
	 * A hook that is called after all nodes have been created.
	 */
	afterCreate(content: ProtoNodes, destination: FieldKey): void;
	beforeDestroy(field: FieldKey, count: number): void;
	beforeAttach(source: FieldKey, count: number, destination: PlaceIndex): void;
	afterAttach(source: FieldKey, destination: Range): void;
	beforeDetach(source: Range, destination: FieldKey): void;
	afterDetach(source: PlaceIndex, count: number, destination: FieldKey): void;
	beforeReplace(
		newContent: FieldKey,
		oldContent: Range,
		oldContentDestination: FieldKey,
	): void;
	afterReplace(newContentSource: FieldKey, newContent: Range, oldContent: FieldKey): void;
}

/**
 * Creates an announced visitor with only the provided functions and uses a no op for the rest.
 * This is provided to make some of the delta visitor definitions cleaner.
 */
export function createAnnouncedVisitor(visitorFunctions: {
	free?: () => void;
	create?: (content: ProtoNodes, destination: FieldKey) => void;
	afterCreate?: (content: ProtoNodes, destination: FieldKey) => void;
	beforeDestroy?: (field: FieldKey, count: number) => void;
	destroy?: (detachedField: FieldKey, count: number) => void;
	beforeAttach?: (source: FieldKey, count: number, destination: PlaceIndex) => void;
	attach?: (source: FieldKey, count: number, destination: PlaceIndex) => void;
	afterAttach?: (source: FieldKey, destination: Range) => void;
	beforeDetach?: (source: Range, destination: FieldKey) => void;
	afterDetach?: (source: PlaceIndex, count: number, destination: FieldKey) => void;
	detach?: (source: Range, destination: FieldKey) => void;
	beforeReplace?: (
		newContent: FieldKey,
		oldContent: Range,
		oldContentDestination: FieldKey,
	) => void;
	replace?: (
		newContentSource: FieldKey,
		range: Range,
		oldContentDestination: FieldKey,
	) => void;
	afterReplace?: (newContentSource: FieldKey, newContent: Range, oldContent: FieldKey) => void;
	enterNode?: (index: NodeIndex) => void;
	exitNode?: (index: NodeIndex) => void;
	enterField?: (key: FieldKey) => void;
	exitField?: (key: FieldKey) => void;
}): AnnouncedVisitor {
	const noOp = (): void => {};
	return {
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
		beforeReplace: visitorFunctions.beforeReplace ?? noOp,
		replace: visitorFunctions.replace ?? noOp,
		afterReplace: visitorFunctions.afterReplace ?? noOp,
		enterNode: visitorFunctions.enterNode ?? noOp,
		exitNode: visitorFunctions.exitNode ?? noOp,
		enterField: visitorFunctions.enterField ?? noOp,
		exitField: visitorFunctions.exitField ?? noOp,
	};
}
