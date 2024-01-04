/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage, ISummaryTree } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { MockStorage } from "@fluidframework/test-runtime-utils";
import { IMergeTreeOp, ReferenceType } from "../ops";
import { SnapshotV1 } from "../snapshotV1";
import { IMergeTreeOptions } from "../mergeTree";
import { PropertySet } from "../properties";
import { ISegment } from "../mergeTreeNodes";
import { createClientsAtInitialState } from "./testClientLogger";
import { TestSerializer } from "./testSerializer";
import { TestClient } from "./testClient";

// Reconstitutes a MergeTree client from a summary
export async function loadSnapshot(summary: ISummaryTree, options?: IMergeTreeOptions) {
	const services = MockStorage.createFromSummary(summary);
	const client2 = new TestClient(options);
	const runtime: Partial<IFluidDataStoreRuntime> = {
		logger: client2.logger,
		clientId: "1",
	};

	const { catchupOpsP } = await client2.load(
		runtime as IFluidDataStoreRuntime,
		services,
		new TestSerializer(),
	);
	await catchupOpsP;
	return client2;
}

// Wrapper around MergeTree client that provides a convenient SharedString-like API for tests.
export class TestString {
	private client: TestClient;
	private readonly pending: ISequencedDocumentMessage[] = [];
	private seq = 0;
	private minSeq = 0;

	constructor(
		id: string,
		private readonly options?: IMergeTreeOptions,
		initialState: string = "",
	) {
		this.client = createClientsAtInitialState({ initialState, options }, id)[id];
		this.client.startOrUpdateCollaboration(id);
	}

	public insert(pos: number, text: string, increaseMsn: boolean) {
		this.queue(
			this.client.insertTextLocal(pos, text, { segment: this.pending.length })!,
			increaseMsn,
		);
	}

	public annotate(start: number, end: number, props: PropertySet, increaseMsn: boolean) {
		this.queue(this.client.annotateRangeLocal(start, end, props)!, increaseMsn);
	}

	public append(text: string, increaseMsn: boolean) {
		this.insert(this.client.getLength(), text, increaseMsn);
	}

	public insertMarker(pos: number, increaseMsn: boolean) {
		this.queue(
			this.client.insertMarkerLocal(pos, ReferenceType.Simple, {
				segment: this.pending.length,
			})!,
			increaseMsn,
		);
	}

	public appendMarker(increaseMsn: boolean) {
		this.insertMarker(this.client.getLength(), increaseMsn);
	}

	public removeRange(start: number, end: number, increaseMsn: boolean) {
		this.queue(this.client.removeRangeLocal(start, end)!, increaseMsn);
	}

	public obliterateRange(start: number, end: number, increaseMsn: boolean) {
		this.queue(this.client.obliterateRangeLocal(start, end)!, increaseMsn);
	}

	// Ensures the client's text matches the `expected` string and round-trips through a snapshot
	// into a new client.  The current client is then replaced with the loaded client in the hope
	// that it will help detect corruption bugs as further ops are applied.
	public async expect(expected: string) {
		assert.equal(
			this.client.getText(),
			expected,
			"MergeTree must contain the expected text prior to applying ops.",
		);

		await this.checkSnapshot(this.options);
	}

	// Ensures the MergeTree client's contents successfully roundtrip through a snapshot.
	public async checkSnapshot(options?: IMergeTreeOptions) {
		this.applyPendingOps();
		const expectedAttributionKeys = this.client.getAllAttributionSeqs();
		const summary = this.getSummary();
		const client2 = await loadSnapshot(summary, options ?? this.options);

		assert.equal(
			this.client.getText(),
			client2.getText(),
			"Snapshot must produce a MergeTree with the same text as the original",
		);

		// Also check the length as weak test for non-TextSegments.
		assert.equal(
			this.client.getLength(),
			client2.getLength(),
			"Snapshot must produce a MergeTree with the same length as the original",
		);

		const actualAttributionKeys = client2.getAllAttributionSeqs();
		assert.deepEqual(
			actualAttributionKeys,
			expectedAttributionKeys,
			"Snapshot must produce a MergeTree with identical attribution as the original",
		);

		// Replace our client with the one loaded by the snapshot.
		this.client = client2;
	}

	public getSummary() {
		const snapshot = new SnapshotV1(this.client.mergeTree, this.client.logger, (id) =>
			this.client.getLongClientId(id),
		);

		snapshot.extractSync();
		return snapshot.emit(TestClient.serializer, undefined!).summary;
	}

	public getText() {
		return this.client.getText();
	}

	public applyPendingOps() {
		for (const msg of this.pending) {
			this.client.applyMsg(msg);
		}
		this.pending.splice(0, this.pending.length);
	}

	private queue(op: IMergeTreeOp, increaseMsn: boolean) {
		const refSeq = this.seq;
		const seq = ++this.seq;

		this.pending.push(
			this.client.makeOpMessage(
				op,
				seq,
				refSeq,
				this.client.longClientId,
				(this.minSeq = increaseMsn ? seq : this.minSeq),
			),
		);
	}

	public getSegment(pos: number): ISegment {
		const { segment } = this.client.getContainingSegment(pos);
		assert(segment !== undefined);
		return segment;
	}
}
