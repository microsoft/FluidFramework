/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { UnassignedSequenceNumber } from "../constants.js";
import type { ISegmentLeaf } from "../mergeTreeNodes.js";
import {
	LocalDefaultPerspective,
	LocalReconnectingPerspective,
	PriorPerspective,
	RemoteObliteratePerspective,
} from "../perspective.js";
import type { IHasInsertionInfo, IHasRemovalInfo } from "../segmentInfos.js";
import type { InsertOperationStamp, OperationStamp, RemoveOperationStamp } from "../stamps.js";

const clientId = 17;
describe("PriorPerspective", () => {
	const refSeq = 10;
	const perspective = new PriorPerspective(refSeq, clientId);
	it("sees operations from the same client", () => {
		const stamp: OperationStamp = { clientId, seq: 1 };
		assert.ok(perspective.hasOccurred(stamp));
	});

	it("sees operations at or below the refSeq", () => {
		for (let seq = 0; seq <= refSeq; seq++) {
			const stamp: OperationStamp = { clientId, seq };
			assert.ok(perspective.hasOccurred(stamp), `Failed for seq ${seq}`);
		}
	});

	it("Does not see operations from other clients above the refSeq", () => {
		const stamp: OperationStamp = { clientId: clientId + 1, seq: refSeq + 1 };
		assert.ok(!perspective.hasOccurred(stamp));
	});

	it("Uses operations to determine segment visibility", () => {
		const insert: InsertOperationStamp = { type: "insert", seq: 5, clientId };
		const remove1: RemoveOperationStamp = { type: "setRemove", seq: 10, clientId };
		const remove2: RemoveOperationStamp = { type: "sliceRemove", seq: 12, clientId };
		const seg1 = { insert } satisfies IHasInsertionInfo as unknown as ISegmentLeaf;
		const seg2: ISegmentLeaf = { insert, removes: [remove1] } satisfies IHasInsertionInfo &
			IHasRemovalInfo as unknown as ISegmentLeaf;
		const seg3 = {
			insert,
			removes: [remove1, remove2],
		} satisfies IHasInsertionInfo & IHasRemovalInfo as unknown as ISegmentLeaf;
		const seg4 = {
			insert,
			removes: [remove2],
		} satisfies IHasInsertionInfo & IHasRemovalInfo as unknown as ISegmentLeaf;
		const perspective1 = new PriorPerspective(4, clientId + 1);
		const perspective2 = new PriorPerspective(6, clientId + 1);
		const perspective3 = new PriorPerspective(10, clientId + 1);

		// Only perspectives 2 and 3 have seen the insert
		assert.ok(!perspective1.isSegmentPresent(seg1));
		assert.ok(perspective2.isSegmentPresent(seg1));
		assert.ok(perspective3.isSegmentPresent(seg1));

		// Perspectives 2 and 3 have seen the insert, and perspective 3 has seen the remove
		assert.ok(!perspective1.isSegmentPresent(seg2));
		assert.ok(perspective2.isSegmentPresent(seg2));
		assert.ok(!perspective3.isSegmentPresent(seg2));

		// Perspectives 2 and 3 have seen the insert, and perspective 3 has seen one of the removes
		assert.ok(!perspective1.isSegmentPresent(seg3));
		assert.ok(perspective2.isSegmentPresent(seg3));
		assert.ok(!perspective3.isSegmentPresent(seg3));

		// Perspectives 2 and 3 have seen the insert, and none have seen the remove
		assert.ok(!perspective1.isSegmentPresent(seg4));
		assert.ok(perspective2.isSegmentPresent(seg4));
		assert.ok(perspective3.isSegmentPresent(seg4));
	});
});

describe("LocalReconnectingPerspective", () => {
	const refSeq = 10;
	const localSeq = 20;
	const perspective = new LocalReconnectingPerspective(refSeq, clientId, localSeq);
	it("sees operations from the same client at or below localSeq", () => {
		for (let i = 0; i <= localSeq; i++) {
			const stamp: OperationStamp = { seq: UnassignedSequenceNumber, clientId, localSeq: i };
			assert.ok(perspective.hasOccurred(stamp), `Failed for localSeq ${i}`);
		}
	});

	it("does not see operations from the same client above localSeq", () => {
		const stamp: OperationStamp = {
			seq: UnassignedSequenceNumber,
			clientId,
			localSeq: localSeq + 1,
		};
		assert.ok(!perspective.hasOccurred(stamp));
	});

	it("sees operations at or below refSeq", () => {
		for (let seq = 0; seq <= refSeq; seq++) {
			const stamp: OperationStamp = {
				seq,
				clientId: seq % 3 === 0 ? clientId : clientId + 1,
			};
			assert.ok(perspective.hasOccurred(stamp), `Failed for seq ${seq}`);
		}
	});

	it("does not see operations from other clients above refSeq", () => {
		const stamp: OperationStamp = { seq: refSeq + 1, clientId: clientId + 1 };
		assert.ok(!perspective.hasOccurred(stamp));
	});
});

describe("LocalDefaultPerspective", () => {
	const perspective = new LocalDefaultPerspective(clientId);
	it("sees all operations", () => {
		for (const id of [0, 1, 2, 3, clientId]) {
			for (const refSeq of [0, 1, 5, 100, 1000]) {
				const stamp: OperationStamp = { seq: 1, clientId: id };
				assert.ok(
					perspective.hasOccurred(stamp),
					`Failed for clientId ${id} and refSeq ${refSeq}`,
				);
			}
		}

		for (const localSeq of [0, 1, 5, 100, 1000]) {
			const stamp: OperationStamp = { seq: UnassignedSequenceNumber, clientId, localSeq };
			assert.ok(perspective.hasOccurred(stamp), `Failed for localSeq ${localSeq}`);
		}
	});
});

describe("RemoteObliteratePerspective", () => {
	const perspective = new RemoteObliteratePerspective(clientId);
	it("Sees all inserts", () => {
		for (const id of [0, 1, 2, 3, clientId]) {
			for (const refSeq of [0, 1, 5, 100, 1000]) {
				const stamp: InsertOperationStamp = { type: "insert", seq: 1, clientId: id };
				assert.ok(
					perspective.hasOccurred(stamp),
					`Failed for clientId ${id} and refSeq ${refSeq}`,
				);
			}
		}

		for (const localSeq of [0, 1, 5, 100, 1000]) {
			const stamp: InsertOperationStamp = {
				type: "insert",
				seq: UnassignedSequenceNumber,
				clientId,
				localSeq,
			};
			assert.ok(perspective.hasOccurred(stamp), `Failed for localSeq ${localSeq}`);
		}
	});

	it("Sees remote removes", () => {
		for (const id of [0, 1, 2, 3, clientId]) {
			for (const refSeq of [0, 1, 5, 100, 1000]) {
				for (const type of ["setRemove", "sliceRemove"] as const) {
					const stamp: RemoveOperationStamp = { type, seq: 1, clientId: id };
					assert.ok(
						perspective.hasOccurred(stamp),
						`Failed for clientId ${id} and refSeq ${refSeq} with ${type}`,
					);
				}
			}
		}
	});

	it("Does not see local removes", () => {
		for (const localSeq of [0, 1, 5, 100, 1000]) {
			for (const type of ["setRemove", "sliceRemove"] as const) {
				const stamp: RemoveOperationStamp = {
					type,
					seq: UnassignedSequenceNumber,
					clientId,
					localSeq,
				};
				assert.ok(!perspective.hasOccurred(stamp), `Failed for localSeq ${localSeq}`);
			}
		}
	});
});
