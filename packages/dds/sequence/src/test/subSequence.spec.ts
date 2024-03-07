/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Serializable } from "@fluidframework/datastore-definitions";
import {
	createInsertSegmentOp,
	createRemoveRangeOp,
	PropertySet,
} from "@fluidframework/merge-tree";
// eslint-disable-next-line import/no-internal-modules
import { TestClient } from "@fluidframework/merge-tree/test";
import { SubSequence } from "../sharedSequence";

const clientNames = ["Ed", "Ted", "Ned", "Harv", "Marv", "Glenda", "Susan"];
const verbose = true;

class SubSequenceTestClient extends TestClient {
	constructor() {
		super(undefined, (spec) => {
			const subSequence = SubSequence.fromJSONObject(spec);
			assert(subSequence !== undefined, "expected `spec` to be a valid `SubSequence`");
			return subSequence;
		});
	}

	public insertItemsRemote<T>(
		pos: number,
		items: Serializable<T>[],
		props: PropertySet | undefined,
		seq: number,
		refSeq: number,
		longClientId: string,
	) {
		const segment = new SubSequence(items);
		if (props) {
			segment.addProperties(props);
		}
		this.applyMsg(
			this.makeOpMessage(createInsertSegmentOp(pos, segment), seq, refSeq, longClientId),
		);
	}

	public relItems(clientId: number, refSeq: number) {
		let items: string = "";

		this.walkSegments(
			(s) => {
				if (SubSequence.is(s)) {
					items += s.items.toString();
				}
				return true;
			},
			0,
			this.getLength(),
		);

		return `cli: ${this.getLongClientId(clientId)} refSeq: ${refSeq}: ${items}`;
	}
}

describe("SubSequence", () => {
	it("firstItemTest", () => {
		const cli = new SubSequenceTestClient();
		cli.startOrUpdateCollaboration("Fred1");
		for (const cname of clientNames) {
			cli.addLongClientId(cname);
		}
		cli.insertItemsRemote(0, [2, 11], undefined, 1, 0, "1");

		if (verbose) {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			console.log(cli.mergeTree.toString());
		}
		cli.insertItemsRemote(0, [4, 5, 6], undefined, 2, 0, "2");
		if (verbose) {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			console.log(cli.mergeTree.toString());
		}
		const segment = new SubSequence<number>([3, 4, 1, 1]);
		const insert = cli.insertSegmentLocal(4, segment);
		if (verbose) {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			console.log(cli.mergeTree.toString());
		}
		if (verbose) {
			for (let i = 0; i < 4; i++) {
				for (let j = 0; j < 3; j++) {
					console.log(cli.relItems(i, j));
				}
			}
		}
		cli.applyMsg(cli.makeOpMessage(insert, 3));
		cli.insertItemsRemote(5, [1, 5, 6, 2, 3], undefined, 4, 2, "2");
		cli.insertItemsRemote(0, [9], undefined, 5, 0, "2");
		if (verbose) {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			console.log(cli.mergeTree.toString());
			for (let clientId = 0; clientId < 4; clientId++) {
				for (let refSeq = 0; refSeq < 6; refSeq++) {
					console.log(cli.relItems(clientId, refSeq));
				}
			}
		}
		cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(3, 6), 6, 5, "3"));
		if (verbose) {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			console.log(cli.mergeTree.toString());
			for (let clientId = 0; clientId < 4; clientId++) {
				for (let refSeq = 0; refSeq < 7; refSeq++) {
					console.log(cli.relItems(clientId, refSeq));
				}
			}
		}
	});
});
