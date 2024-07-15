/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { SegmentGroup } from "../index.js";
import {
	IMergeTreeDeltaOp,
	type IMergeTreeInsertMsg,
	type IMergeTreeObliterateMsg,
	type IMergeTreeRemoveMsg,
} from "../ops.js";

import { TestClientLogger, createClientsAtInitialState } from "./testClientLogger.js";

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
		return (name.codePointAt(0) ?? 0) - ("A".codePointAt(0) ?? 0);
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

	public insertTextLocal(
		clientName: ClientName,
		pos: number,
		text: string,
	): {
		op: IMergeTreeInsertMsg;
		seg: SegmentGroup;
		refSeq: number;
	} {
		const client = this.clients[clientName];
		const op = client.insertTextLocal(pos, text);
		assert(op);
		const seg = client.peekPendingSegmentGroups();
		assert(seg);
		return { op, seg, refSeq: client.getCollabWindow().currentSeq };
	}

	public removeRangeLocal(
		clientName: ClientName,
		start: number,
		end: number,
	): {
		op: IMergeTreeRemoveMsg;
		seg: SegmentGroup;
		refSeq: number;
	} {
		const client = this.clients[clientName];
		const op = client.removeRangeLocal(start, end);
		assert(op);
		const seg = client.peekPendingSegmentGroups();
		assert(seg);
		return { op, seg, refSeq: client.getCollabWindow().currentSeq };
	}

	public obliterateRangeLocal(
		clientName: ClientName,
		start: number,
		end: number,
	): {
		op: IMergeTreeObliterateMsg;
		seg: SegmentGroup;
		refSeq: number;
	} {
		const client = this.clients[clientName];
		const op = client.obliterateRangeLocal(start, end);
		assert(op);
		const seg = client.peekPendingSegmentGroups();
		assert(seg);
		return { op, seg, refSeq: client.getCollabWindow().currentSeq };
	}

	public disconnect(clientNames: ClientName[]): void {
		const clientIdxs = new Set(clientNames.map((element) => this.idxFromName(element)));
		for (const op of this.ops.splice(0))
			for (const [i, c] of this.clients.all.entries()) {
				if (clientIdxs.has(i)) {
					this.perClientOps[i].push(op);
				} else {
					c.applyMsg(op);
				}
			}
	}

	public processAllOps(): void {
		for (const op of this.ops.splice(0))
			for (const c of this.clients.all) {
				c.applyMsg(op);
			}
	}

	public reconnect(clientNames: ClientName[]): void {
		const clientIdxs = new Set(clientNames.map((element) => this.idxFromName(element)));
		for (const [i, clientOps] of this.perClientOps.entries()) {
			if (clientIdxs.has(i)) {
				for (const op of clientOps.splice(0)) this.clients.all[i].applyMsg(op);
			}
		}
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
