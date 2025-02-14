/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import type { IMergeTreeOptions, InteriorSequencePlace } from "../index.js";

import type { TestClient } from "./testClient.js";
import { TestClientLogger, createClientsAtInitialState } from "./testClientLogger.js";

const ClientIds = ["A", "B", "C", "D"] as const;
type ClientName = (typeof ClientIds)[number];

/**
 * Like `ReconnectHelper`, but:
 * - does not support reconnecting clients
 * - supports advancing only some clients to a given sequence number (not all clients must be synchronized at the same time).
 *
 * This allows testing sequences of operations where clients have varying refSeqs, rather than having all clients advance refSeq
 * in lockstep.
 */
export class PartialSyncTestHelper {
	clients: Record<ClientName, TestClient> & { all: TestClient[] };

	idxFromName(name: ClientName): number {
		return (name.codePointAt(0) ?? 0) - ("A".codePointAt(0) ?? 0);
	}

	logger: TestClientLogger;

	ops: ISequencedDocumentMessage[] = [];
	clientToLastAppliedSeq = new Map<ClientName, number>();

	perClientOps: ISequencedDocumentMessage[][];

	private seq: number = 0;

	public constructor(options: IMergeTreeOptions = {}) {
		this.clients = createClientsAtInitialState(
			{
				initialState: "",
				options: {
					mergeTreeEnableObliterate: true,
					mergeTreeEnableSidedObliterate: true,
					...options,
				},
			},
			...ClientIds,
		);
		this.logger = new TestClientLogger(this.clients.all);
		this.perClientOps = this.clients.all.map(() => []);
	}

	private addMessage(message: ISequencedDocumentMessage): void {
		this.ops.push(message);
		// This implementation (specifically, that of applying ops / synchronizing clients) assumes messages
		// are pushed sequentially starting with seq 1.
		assert(
			message.sequenceNumber === this.ops.length,
			"Partial sync test helper invariant violated",
		);
	}

	public insertText(clientName: ClientName, pos: number, text: string): void {
		const client = this.clients[clientName];
		this.addMessage(client.makeOpMessage(client.insertTextLocal(pos, text), ++this.seq));
	}

	public removeRange(clientName: ClientName, start: number, end: number): void {
		const client = this.clients[clientName];
		this.addMessage(client.makeOpMessage(client.removeRangeLocal(start, end), ++this.seq));
	}

	public obliterateRange(
		clientName: ClientName,
		start: number | InteriorSequencePlace,
		end: number | InteriorSequencePlace,
	): void {
		const client = this.clients[clientName];
		this.addMessage(
			client.makeOpMessage(
				// TODO: remove type assertions when sidedness is enabled
				client.obliterateRangeLocal(start as number, end as number),
				++this.seq,
			),
		);
	}

	public advanceClientToSeq(clientName: ClientName, seq: number): void {
		const client = this.clients[clientName];
		const lastApplied = this.clientToLastAppliedSeq.get(clientName);
		assert(seq > 0, "Can only advance clients to sequence numbers that exist");
		assert(
			this.ops.length >= seq,
			"Cannot attempt to advance clients to sequence numbers that don't yet exist",
		);
		let startIndex: number;
		if (lastApplied !== undefined) {
			if (lastApplied >= seq) {
				return;
			}
			startIndex = lastApplied;
		} else {
			startIndex = 0;
		}
		for (let i = startIndex; i < seq; i++) {
			const nextMessage = this.ops[i];
			client.applyMsg(nextMessage);
			this.clientToLastAppliedSeq.set(clientName, nextMessage.sequenceNumber);
		}
	}

	/**
	 * Sends all known ops to the procieded client ids.
	 */
	public advanceClients(...clientNames: ClientName[]): void {
		const latestSeq = this.ops[this.ops.length - 1].sequenceNumber;
		for (const name of clientNames) {
			this.advanceClientToSeq(name, latestSeq);
		}
	}

	public processAllOps(): void {
		const latestSeq = this.ops[this.ops.length - 1].sequenceNumber;
		for (const name of ClientIds) {
			this.advanceClientToSeq(name, latestSeq);
		}
	}
}
