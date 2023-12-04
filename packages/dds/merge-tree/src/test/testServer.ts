/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { Heap, IComparer } from "@fluidframework/core-utils";
import { RedBlackTree } from "../collections";
import { compareNumbers } from "../mergeTreeNodes";
import { PropertySet } from "../properties";
import { MergeTreeTextHelper } from "../MergeTreeTextHelper";
import { TestClient } from "./testClient";

interface ClientSeq {
	refSeq: number;
	clientId: string;
}

const clientSeqComparer: IComparer<ClientSeq> = {
	min: { refSeq: -1, clientId: "" },
	compare: (a, b) => a.refSeq - b.refSeq,
};

/**
 * Server for tests.  Simulates client communication by directing placing
 * messages in client queues.
 */
export class TestServer extends TestClient {
	seq = 1;
	clients: TestClient[] = [];
	clientSeqNumbers: Heap<ClientSeq> = new Heap<ClientSeq>(clientSeqComparer);
	upstreamMap: RedBlackTree<number, number> = new RedBlackTree<number, number>(compareNumbers);
	constructor(options?: PropertySet) {
		super(options);
	}

	addClients(clients: TestClient[]) {
		this.clientSeqNumbers = new Heap<ClientSeq>(clientSeqComparer);
		this.clients = clients;
		for (const client of clients) {
			this.clientSeqNumbers.add({
				refSeq: client.getCurrentSeq(),
				clientId: client.longClientId ?? "",
			});
		}
	}

	applyMsg(msg: ISequencedDocumentMessage) {
		super.applyMsg(msg);
		if (TestClient.useCheckQ) {
			const clid = this.getShortClientId(msg.clientId as string);
			return checkTextMatchRelative(msg.referenceSequenceNumber, clid, this, msg);
		} else {
			return false;
		}
	}

	// TODO: remove mappings when no longer needed using min seq
	// in upstream message
	transformUpstreamMessage(msg: ISequencedDocumentMessage) {
		if (msg.referenceSequenceNumber > 0) {
			msg.referenceSequenceNumber =
				this.upstreamMap.get(msg.referenceSequenceNumber)?.data ?? 0;
		}
		msg.origin = {
			id: "A",
			sequenceNumber: msg.sequenceNumber,
			minimumSequenceNumber: msg.minimumSequenceNumber,
		};
		this.upstreamMap.put(msg.sequenceNumber, this.seq);
		msg.sequenceNumber = -1;
	}

	copyMsg(msg: ISequencedDocumentMessage) {
		return {
			clientId: msg.clientId,
			clientSequenceNumber: msg.clientSequenceNumber,
			contents: msg.contents,
			minimumSequenceNumber: msg.minimumSequenceNumber,
			referenceSequenceNumber: msg.referenceSequenceNumber,
			sequenceNumber: msg.sequenceNumber,
			type: msg.type,
		} as any as ISequencedDocumentMessage;
	}

	private minSeq = 0;

	applyMessages(msgCount: number) {
		let _msgCount = msgCount;
		while (_msgCount > 0) {
			const msg = this.dequeueMsg();
			if (msg) {
				if (msg.sequenceNumber >= 0) {
					this.transformUpstreamMessage(msg);
				}
				msg.sequenceNumber = this.seq++;
				msg.minimumSequenceNumber = this.minSeq;
				if (this.applyMsg(msg)) {
					return true;
				}
				if (this.clients) {
					let minCli = this.clientSeqNumbers.peek()?.value;
					if (
						minCli &&
						minCli.clientId === msg.clientId &&
						minCli.refSeq < msg.referenceSequenceNumber
					) {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const cliSeq = this.clientSeqNumbers.get()!;
						const oldSeq = cliSeq.refSeq;
						cliSeq.refSeq = msg.referenceSequenceNumber;
						this.clientSeqNumbers.add(cliSeq);
						minCli = this.clientSeqNumbers.peek()?.value;
						if (minCli && minCli.refSeq > oldSeq) {
							msg.minimumSequenceNumber = minCli.refSeq;
							this.minSeq = minCli.refSeq;
						}
					}
					for (const client of this.clients) {
						client.enqueueMsg(msg);
					}
				}
			} else {
				break;
			}
			_msgCount--;
		}
		return false;
	}
}

/**
 * Used for in-memory testing.  This will queue a reference string for each client message.
 */
export function checkTextMatchRelative(
	refSeq: number,
	clientId: number,
	server: TestServer,
	msg: ISequencedDocumentMessage,
) {
	const client = server.clients[clientId];
	const serverText = new MergeTreeTextHelper(server.mergeTree).getText(refSeq, clientId);
	const cliText = client.checkQ.shift()?.data;
	if (cliText === undefined || cliText !== serverText) {
		console.log(`mismatch `);
		console.log(msg);
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		console.log(server.mergeTree.toString());
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		console.log(client.mergeTree.toString());
		return true;
	}
	return false;
}
