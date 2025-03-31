/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { seqLTE, type ISegment } from "./mergeTreeNodes.js";
import { isInserted, isRemoved } from "./segmentInfos.js";
import * as opstampUtils from "./stamps.js";
import type { OperationStamp, RemoveOperationStamp } from "./stamps.js";

/**
 * A perspective which includes some subset of operations known to the local client.
 *
 * This helps the local client reason about the state of other clients when they issued an operation.
 * @internal
 */
export interface Perspective {
	/**
	 * The sequence number last seen from this perspective. Same concept as `ISequencedDocumentMessage.referenceSequenceNumber`.
	 * @privateRemarks
	 * This currently allows inter-operation between MergeTree methods and the partial lengths implementation, which still depends
	 * on the (refSeq, clientId, localSeq?) representation of perspectives.
	 */
	readonly refSeq: number;

	/**
	 * The client id for this perspective.
	 * @privateRemarks
	 * This currently allows inter-operation between MergeTree methods and the partial lengths implementation, which still depends
	 * on the (refSeq, clientId, localSeq?) representation of perspectives.
	 */
	readonly clientId: number;

	/**
	 * When this is a local perspective, the local sequence number last seen from this perspective.
	 *
	 * Perspectives with defined `localSeq` values are useful in reconnection flows, where the local client may need to resend some
	 * of its ops after rederiving their new equivalents.
	 * @privateRemarks
	 * This currently allows inter-operation between MergeTree methods and the partial lengths implementation, which still depends
	 * on the (refSeq, clientId, localSeq?) representation of perspectives.
	 */
	readonly localSeq?: number;

	/**
	 * @returns Whether the segment is present (visible) from this perspective
	 */
	isSegmentPresent(segment: ISegment): boolean;

	/**
	 * @returns Whether this perspective has seen the given operation.
	 */
	hasOccurred(stamp: OperationStamp): boolean;
}

abstract class PerspectiveBase {
	abstract hasOccurred(stamp: OperationStamp): boolean;

	public isSegmentPresent(seg: ISegment): boolean {
		if (isInserted(seg) && !this.hasOccurred(seg.insert)) {
			return false;
		}

		if (isRemoved(seg) && seg.removes.some((remove) => this.hasOccurred(remove))) {
			return false;
		}

		return true;
	}
}

/**
 * A perspective which includes edits at or before some reference sequence number alongside all edits from some particular client.
 *
 * @remarks
 * This works for both the local client as well as remote clients since refSeq-based checks disallow unacked edits, but the clientId check
 * catches unacked edits from the local client.
 */
export class PriorPerspective extends PerspectiveBase implements Perspective {
	public constructor(
		public readonly refSeq: number,
		public readonly clientId: number,
	) {
		super();
	}

	public hasOccurred(stamp: OperationStamp): boolean {
		const predatesViaRefSeq = seqLTE(stamp.seq, this.refSeq);
		const predatesViaSameClient = stamp.clientId === this.clientId;
		return predatesViaRefSeq || predatesViaSameClient;
	}
}

/**
 * A perspective which includes edits which were either:
 * - acked and at or before some reference sequence number
 * - unacked, but at or before some local sequence number
 *
 * This is a useful perspective when the local client is in the process of reconnecting, since it must
 * rederive positions for unacked ops while only considering a portion of its own edits as having been applied.
 */
export class LocalReconnectingPerspective extends PerspectiveBase implements Perspective {
	public constructor(
		public readonly refSeq: number,
		public readonly clientId: number,
		public readonly localSeq: number,
	) {
		super();
	}

	public hasOccurred(stamp: OperationStamp): boolean {
		const predatesViaRefSeq = seqLTE(stamp.seq, this.refSeq);
		const predatesViaLocalSeq =
			stamp.localSeq !== undefined && stamp.localSeq <= this.localSeq;
		return predatesViaRefSeq || predatesViaLocalSeq;
	}
}

/**
 * A perspective which includes all known edits.
 *
 * This is the perspective that the application sees.
 * @remarks
 * This can be represented using {@link PriorPerspective} with a refSeq of `Number.MAX_SAFE_INTEGER`, but having an explicit
 * variant of this perspective renders extra refSeq checks unnecessary and is a bit easier to read.
 */
export class LocalDefaultPerspective extends PerspectiveBase implements Perspective {
	public readonly refSeq = Number.MAX_SAFE_INTEGER;

	public constructor(public readonly clientId: number) {
		super();
	}

	public hasOccurred(_stamp: OperationStamp): boolean {
		return true;
	}
}

/**
 * A perspective dictating whether segments are 'visible' to a remote obliterate operation.
 *
 * NOTE: Beware that partial lengths doesn't support this perspective, in the sense that consulting partial lengths' for the length of a block
 * can give different results than summing the lengths of present segments in that block.
 * This ends up not affecting the current obliterate implementation (which has some special casing in the mapRange calls it uses),
 * but use with caution.
 */
export class RemoteObliteratePerspective extends PerspectiveBase implements Perspective {
	public readonly refSeq = Number.MAX_SAFE_INTEGER;

	constructor(public readonly clientId: number) {
		super();
	}

	public hasOccurred(stamp: OperationStamp): boolean {
		// Local-only removals are not visible to an obliterate operation, since this means the local removal was concurrent
		// to a remote obliterate and we may need to mark the segment appropriately to reflect this overlapping remove.
		// Every other type of operation is visible: obliterates do not affect segments that have already been removed and acked,
		// and they always affect segments within their range that have not been removed, even if those segments were inserted
		// after the obliterate's refSeq.
		if (isRemoveOperationStamp(stamp) && opstampUtils.isLocal(stamp)) {
			return false;
		}

		return true;
	}
}

function isRemoveOperationStamp(stamp: OperationStamp): stamp is RemoveOperationStamp {
	const { type } = stamp as unknown as RemoveOperationStamp;
	return type === "setRemove" || type === "sliceRemove";
}
