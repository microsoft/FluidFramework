/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-deprecated */

import { assert } from "@fluidframework/core-utils";
import { LocalClientId } from "./constants";
import { LocalReferenceCollection } from "./localReference";
import { ISegmentLeaf, MergeTree } from "./mergeTree";
import { IMergeBlock, IRemovalInfo, ISegment } from "./mergeTreeNodes";
import { depthFirstNodeWalk, NodeAction } from "./mergeTreeNodeWalk";

/**
 * This is a special segment that is not bound or known by the merge tree itself,
 * but the segment itself pretends to be a removed segment at an endpoint of the
 * tree. It is removed so it appears as a undefined/0 length segment. This segment
 * adds the capability to hold local references that have been detached from the
 * real merge tree, and give the appearance that they exist at an endpoint of the
 * tree.
 *
 * This is useful today in 2 cases: detached references and interval stickiness.
 *
 * In general, local references only become detached when the tree becomes empty
 * and the EndOfTreeSegment allows us to gracefully handle that case by giving
 * those references a place to live.
 *
 * In the case of interval stickiness, it is desirable to be able to refer to
 * the position immediately after or before a segment, in order for the endpoint
 * of an interval to be exclusive. This means that in order to support intervals
 * that are exclusive and also include the first or last segment of the tree, it
 * must be possible in some way to refer to a position before or after the tree
 * respectively. The endpoint segments allow us to support such behavior.
 */
abstract class BaseEndpointSegment {
	constructor(protected readonly mergeTree: MergeTree) {}
	/*
	 * segments must be of at least length one, but
	 * removed segments will have a calculated length
	 * of undefined/0. we leverage this to create
	 * a 0 length segment for an endpoint of the tree
	 */
	removedSeq: number = 0;
	removedClientIds: number[] = [LocalClientId];
	attribution: undefined;
	propertyManager: undefined;
	localSeq: undefined;
	localRemovedSeq: undefined;
	properties: undefined;
	seq = 0;
	clientId = LocalClientId;
	cachedLength = 1;

	isLeaf(): this is ISegment {
		return true;
	}

	protected abstract endpointSegmentProps(): {
		parent: IMergeBlock;
		index: number;
		depth: number;
	};

	get parent() {
		return this.endpointSegmentProps().parent;
	}

	get index() {
		return this.endpointSegmentProps().index;
	}

	abstract get ordinal(): string;

	localRefs?: LocalReferenceCollection;

	/*
	 * since this segment isn't real, throw on any segment
	 * operation that isn't expected
	 */
	get segmentGroups() {
		return notSupported();
	}
	get trackingCollection() {
		return notSupported();
	}
	addProperties = notSupported;
	clone = notSupported;
	canAppend = notSupported;
	append = notSupported;
	splitAt = notSupported;
	toJSONObject = notSupported;
	ack = notSupported;
}

const notSupported = () => {
	assert(false, 0x3ed /* operation not supported */);
};

/**
 * The position immediately prior to the start of the tree
 */
export class StartOfTreeSegment extends BaseEndpointSegment implements ISegment, IRemovalInfo {
	type: string = "StartOfTreeSegment";
	readonly endpointType = "start";

	/**
	 * this segment pretends to be a sibling of the first real segment.
	 * so compute the necessary properties to pretend to be that segment.
	 */
	protected endpointSegmentProps() {
		let firstSegment: ISegmentLeaf | undefined;
		let depth = 1;
		const root = this.mergeTree.root;
		depthFirstNodeWalk(
			root,
			root.children[0],
			(node) => {
				depth++;
				if (node?.isLeaf()) {
					firstSegment = node;
					return NodeAction.Exit;
				}
			},
			undefined,
			undefined,
			false,
		);
		const parent = firstSegment?.parent ?? root;
		const index = 0;
		return {
			parent,
			index,
			depth,
		};
	}

	get ordinal() {
		return String.fromCharCode(0x00);
	}
}

/**
 * The position immediately after the end of the tree
 */
export class EndOfTreeSegment extends BaseEndpointSegment implements ISegment, IRemovalInfo {
	type: string = "EndOfTreeSegment";
	readonly endpointType = "end";

	/**
	 * this segment pretends to be a sibling of the last real segment.
	 * so compute the necessary properties to pretend to be that segment.
	 */
	protected endpointSegmentProps() {
		let lastSegment: ISegmentLeaf | undefined;
		let depth = 1;
		const root = this.mergeTree.root;
		depthFirstNodeWalk(
			root,
			root.children[root.childCount - 1],
			(node) => {
				depth++;
				if (node?.isLeaf()) {
					lastSegment = node;
					return NodeAction.Exit;
				}
			},
			undefined,
			undefined,
			false,
		);
		const parent = lastSegment?.parent ?? root;
		const index = parent.childCount;
		return {
			parent,
			index,
			depth,
		};
	}

	get ordinal() {
		// just compute an arbitrarily big ordinal
		// we base it on the depth of the tree
		// to ensure it is bigger than all ordinals in
		// the tree, as each layer appends to the previous
		return String.fromCharCode(0xffff).repeat(this.endpointSegmentProps().depth);
	}
}
