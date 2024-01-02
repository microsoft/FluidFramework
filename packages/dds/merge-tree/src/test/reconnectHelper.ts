/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IMergeTreeDeltaOp } from "../ops";
import { SegmentGroup } from "..";
import { createClientsAtInitialState, TestClientLogger } from "./testClientLogger";

const ClientIds = ["A", "B", "C", "D"] as const;
type ClientName = (typeof ClientIds)[number];

export class ReconnectTestHelper {
	clients = createClientsAtInitialState(
		{
			initialState: "",
			options: { mergeTreeEnableObliterate: true },
		},
		...ClientIds,
	);

	idxFromName(name: ClientName): number {
		return name.charCodeAt(0) - "A".charCodeAt(0);
	}

	logger = new TestClientLogger(this.clients.all);

	ops: ISequencedDocumentMessage[] = [];
	perClientOps: ISequencedDocumentMessage[][] = this.clients.all.map(() => []);

	seq: number = 0;

	public insertText(clientName: ClientName, pos: number, text: string): void {
		const client = this.clients[clientName];
		this.ops.push(client.makeOpMessage(client.insertTextLocal(pos, text), ++this.seq));
	}

	public removeRange(clientName: ClientName, start: number, end: number): void {
		const client = this.clients[clientName];
		this.ops.push(client.makeOpMessage(client.removeRangeLocal(start, end), ++this.seq));
	}

	public obliterateRange(clientName: ClientName, start: number, end: number): void {
		const client = this.clients[clientName];
		this.ops.push(client.makeOpMessage(client.obliterateRangeLocal(start, end), ++this.seq));
	}

	public insertTextLocal(clientName: ClientName, pos: number, text: string) {
		const client = this.clients[clientName];
		const op = client.insertTextLocal(pos, text);
		assert(op);
		const seg = client.peekPendingSegmentGroups();
		assert(seg);
		return { op, seg, refSeq: client.getCollabWindow().currentSeq };
	}

	public removeRangeLocal(clientName: ClientName, start: number, end: number) {
		const client = this.clients[clientName];
		const op = client.removeRangeLocal(start, end);
		assert(op);
		const seg = client.peekPendingSegmentGroups();
		assert(seg);
		return { op, seg, refSeq: client.getCollabWindow().currentSeq };
	}

	public obliterateRangeLocal(clientName: ClientName, start: number, end: number) {
		const client = this.clients[clientName];
		const op = client.obliterateRangeLocal(start, end);
		assert(op);
		const seg = client.peekPendingSegmentGroups();
		assert(seg);
		return { op, seg, refSeq: client.getCollabWindow().currentSeq };
	}

	public disconnect(clientNames: ClientName[]): void {
		const clientIdxs = clientNames.map(this.idxFromName);
		this.ops
			.splice(0)
			.forEach((op) =>
				this.clients.all.forEach((c, i) =>
					clientIdxs.includes(i) ? this.perClientOps[i].push(op) : c.applyMsg(op),
				),
			);
	}

	public processAllOps(): void {
		this.ops.splice(0).forEach((op) =>
			this.clients.all.forEach((c) => {
				c.applyMsg(op);
			}),
		);
	}

	public reconnect(clientNames: ClientName[]): void {
		const clientIdxs = clientNames.map(this.idxFromName);
		this.perClientOps.forEach((clientOps, i) => {
			if (clientIdxs.includes(i)) {
				clientOps.splice(0).forEach((op) => this.clients.all[i].applyMsg(op));
			}
		});
	}

	public submitDisconnectedOp(
		clientName: ClientName,
		op: { op: IMergeTreeDeltaOp; seg: SegmentGroup | SegmentGroup[]; refSeq: number },
	): void {
		const client = this.clients[clientName];
		this.ops.push(
			client.makeOpMessage(client.regeneratePendingOp(op.op, op.seg), ++this.seq, op.refSeq),
		);
	}
}
