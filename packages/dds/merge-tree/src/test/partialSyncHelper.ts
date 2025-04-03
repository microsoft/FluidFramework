/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import type { IMergeTreeOp, IMergeTreeOptions, InteriorSequencePlace } from "../index.js";
import type { SegmentGroup } from "../mergeTreeNodes.js";

import type { TestClient } from "./testClient.js";
import { TestClientLogger, createClientsAtInitialState } from "./testClientLogger.js";

const ClientIds = ["A", "B", "C", "D"] as const;
type ClientName = (typeof ClientIds)[number];

function isClientId(s: unknown): s is ClientName {
	return ClientIds.includes(s as ClientName);
}

function clientNameOf(client: TestClient): ClientName {
	const { longClientId } = client;
	assert(isClientId(longClientId), "Client ID is not a valid client name");
	return longClientId;
}

/**
 * Helper for authoring tests which perform operations on a number of clients.
 * This class essentially serves the role of the server in that it maintains a sequencing order of ops as well as information
 * about the latest op that each client has applied.
 *
 * When using this class, *do not* perform operations which may submit ops on clients directly: it does not currently wire up client events
 * to the server. Instead, use methods on the helper and pass the client name they should apply to as the first argument.
 *
 * It is analogous to MockContainerRuntimeFactory in the test-runtime-utils package, though the APIs are not completely equivalent
 * (see for example differences noted on disconnect and reconnect).
 *
 * This helper is also designed to support advancing only some clients to a given sequence number
 * (not all clients must be synchronized at the same time).
 *
 * This allows testing sequences of operations where clients have varying refSeqs, rather than having all clients advance refSeq
 * in lockstep.
 *
 * @remarks
 * If we wired the server up to "delta" events on the client, it would be reasonable to rename this to `MockServer` and the API for tests
 * would be a bit cleaner.
 */
export class ClientTestHelper {
	clients: Record<ClientName, TestClient> & { all: TestClient[] };

	idxFromName(name: ClientName): number {
		return (name.codePointAt(0) ?? 0) - ("A".codePointAt(0) ?? 0);
	}

	logger: TestClientLogger;

	ops: ISequencedDocumentMessage[] = [];
	clientToLastAppliedSeq = new Map<ClientName, number>();

	perClientOps: ISequencedDocumentMessage[][];
	private readonly disconnectedClientOps = new Map<
		ClientName,
		{ op: IMergeTreeOp; segmentGroup: SegmentGroup }[]
	>();

	private seq: number = 0;

	public constructor(options: IMergeTreeOptions = {}) {
		this.clients = createClientsAtInitialState(
			{
				initialState: "",
				options: {
					mergeTreeEnableObliterate: true,
					mergeTreeEnableObliterateReconnect: true,
					...options,
				},
			},
			...ClientIds,
		);
		this.logger = new TestClientLogger(this.clients.all);
		this.perClientOps = this.clients.all.map(() => []);
	}

	private addMessage(client: TestClient, op: IMergeTreeOp): void {
		const disconnectedQueue = this.disconnectedClientOps.get(clientNameOf(client));
		if (disconnectedQueue === undefined) {
			const message = client.makeOpMessage(op, ++this.seq);
			this.ops.push(message);
			// This implementation (specifically, that of applying ops / synchronizing clients) assumes messages
			// are pushed sequentially starting with seq 1.
			assert(
				message.sequenceNumber === this.ops.length,
				"Partial sync test helper invariant violated",
			);
		} else {
			// Client is not currently connected.
			const segmentGroup = client.peekPendingSegmentGroups();
			assert(segmentGroup !== undefined, "Client should have a pending segment group");
			disconnectedQueue.push({ op, segmentGroup });
		}
	}

	public insertText(clientName: ClientName, pos: number, text: string): void {
		const client = this.clients[clientName];
		const insertOp = client.insertTextLocal(pos, text);
		if (insertOp) {
			this.addMessage(client, insertOp);
		}
	}

	public removeRange(clientName: ClientName, start: number, end: number): void {
		const client = this.clients[clientName];
		this.addMessage(client, client.removeRangeLocal(start, end));
	}

	public obliterateRange(
		clientName: ClientName,
		start: number | InteriorSequencePlace,
		end: number | InteriorSequencePlace,
	): void {
		const client = this.clients[clientName];
		this.addMessage(client, client.obliterateRangeLocal(start, end));
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
		if (lastApplied === undefined) {
			startIndex = 0;
		} else {
			if (lastApplied >= seq) {
				return;
			}
			startIndex = lastApplied;
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

	/**
	 * Causes the provided clients to "disconnect" by isolating their outbound queue from the op stream.
	 * These clients will still receive ops from this helper just like all other clients.
	 * When a client reconnects (see {@link reconnect}), the helper will rebase all of the client's pending ops (that they submitted since
	 * `disconnect` was called) and re-add them to the op stream.
	 *
	 * BEWARE: This is slightly different from what the mocks in test-runtime-utils do in two ways:
	 *
	 * 1. Those mocks actually wipe outstanding ops submitted by the disconnected clients from the op stream and rebases those as well.
	 * 2. Those mocks freeze the inbound queue of the disconnected clients as well as the outbound queue.
	 *
	 * E.g. (pseudocode; syntax is different for those mocks and these):
	 *
	 * ```typescript
	 * B.submitLocalOp1()
	 * B.submitLocalOp2()
	 * disconnect(B)
	 * A.submitLocalOp1()
	 * B.submitLocalOp3()
	 * processAllOps()
	 * ```
	 *
	 * for the test-runtime-mocks will...
	 *
	 * - have none of B's local ops be receieved by A in the processAllOps() line
	 * - have B not receive A's local op 1
	 *
	 * whereas this helper will...
	 *
	 * - have B's local ops 1 and 2 be received by A, but not its third local op
	 * - have B receive acks for its first two local ops as well as A's op in the processAllOps() line
	 *
	 * This operation is a no-op if called multiple times on the same client with no intervening reconnects.
	 */
	public disconnect(...clientNames: ClientName[]): void {
		for (const clientName of clientNames) {
			const client = this.clients[clientName];
			if (this.isDisconnected(client)) {
				continue;
			}
			this.disconnectedClientOps.set(clientName, []);
		}
	}

	/**
	 * Reconnects clients which have been disconnected. No-ops on any client which is already connected.
	 * For disconnected clients, any pending ops they have will be resubmitted using the resubmit flow, see {@link disconnect} for details and an example.
	 *
	 * @remarks
	 * If reconnecting multiple clients, the order that their ops will be resubmitted in will match the order in the array
	 */
	public reconnect(...clientNames: ClientName[]): void {
		for (const clientName of clientNames) {
			const submittedOps = this.disconnectedClientOps.get(clientName);
			if (submittedOps === undefined) {
				continue;
			}
			this.disconnectedClientOps.delete(clientName);
			const client = this.clients[clientName];
			for (const { op, segmentGroup } of submittedOps) {
				const rebasedOp = client.regeneratePendingOp(op, segmentGroup);
				this.addMessage(client, rebasedOp);
			}
		}
	}

	private isDisconnected(client: TestClient): boolean {
		return this.disconnectedClientOps.has(clientNameOf(client));
	}
}
