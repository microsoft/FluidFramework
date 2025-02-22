/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import {
	endpointPosAndSide,
	type IMergeTreeOptions,
	type InteriorSequencePlace,
	type SequencePlace,
} from "../index.js";
import type { SegmentGroup } from "../mergeTreeNodes.js";
import {
	IMergeTreeDeltaOp,
	type IMergeTreeInsertMsg,
	type IMergeTreeObliterateMsg,
	type IMergeTreeObliterateSidedMsg,
	type IMergeTreeRemoveMsg,
} from "../ops.js";

import type { TestClient } from "./testClient.js";
import { TestClientLogger, createClientsAtInitialState } from "./testClientLogger.js";

const ClientIds = ["A", "B", "C", "D"] as const;
type ClientName = (typeof ClientIds)[number];

export class ReconnectTestHelper {
	clients: Record<ClientName, TestClient> & { all: TestClient[] };

	idxFromName(name: ClientName): number {
		return (name.codePointAt(0) ?? 0) - ("A".codePointAt(0) ?? 0);
	}

	logger: TestClientLogger;

	ops: ISequencedDocumentMessage[] = [];
	perClientOps: ISequencedDocumentMessage[][];

	seq: number = 0;

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

	public insertText(clientName: ClientName, pos: number, text: string): void {
		const client = this.clients[clientName];
		this.ops.push(client.makeOpMessage(client.insertTextLocal(pos, text), ++this.seq));
	}

	public removeRange(clientName: ClientName, start: number, end: number): void {
		const client = this.clients[clientName];
		this.ops.push(client.makeOpMessage(client.removeRangeLocal(start, end), ++this.seq));
	}

	public obliterateRange(
		clientName: ClientName,
		start: number | InteriorSequencePlace,
		end: number | InteriorSequencePlace,
	): void {
		const client = this.clients[clientName];
		this.ops.push(
			client.makeOpMessage(
				// TODO: remove type assertions when sidedness is enabled
				client.obliterateRangeLocal(start as number, end as number),
				++this.seq,
			),
		);
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
		start: SequencePlace,
		end: SequencePlace,
	): {
		op: IMergeTreeObliterateMsg | IMergeTreeObliterateSidedMsg;
		seg: SegmentGroup;
		refSeq: number;
	} {
		const client = this.clients[clientName];
		let { startPos, endPos } = endpointPosAndSide(start, end);
		assert(
			startPos !== undefined && endPos !== undefined,
			"start and end positions must be defined",
		);
		startPos = startPos === "start" ? 0 : startPos;
		endPos = endPos === "end" ? client.getLength() : endPos;
		assert(
			startPos !== "end" && endPos !== "start",
			"start cannot be end and end cannot be start",
		);
		const op = client.obliterateRangeLocal(startPos, endPos);
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
		op: { op: IMergeTreeDeltaOp; seg: SegmentGroup | SegmentGroup[] },
	): void {
		const client = this.clients[clientName];
		this.ops.push(client.makeOpMessage(client.regeneratePendingOp(op.op, op.seg), ++this.seq));
	}
}
