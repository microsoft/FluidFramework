/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	field,
	frame,
	latestSnapshotPayload,
	optionalField,
	reference,
	requestKinds,
	submittedPosition,
	u64,
} from "./fsp4.js";
import type { WasmProtocolClient } from "./wasmClient.js";

/** Encodes the small unary FSP4 request surface still owned by TypeScript. */
export class ProtocolClient {
	/** Next request identity emitted by this client instance. */
	private nextRequestId = 1n;

	/** Creates a protocol encoder over a generated or injected WASM client. */
	public constructor(public readonly wasm: WasmProtocolClient) {}

	/** Creates an empty document. */
	public async create(document: Uint8Array): Promise<void> {
		await this.send(requestKinds.create, field(document));
	}

	/** Opens a writer session, optionally resuming after a committed position. */
	public async openSession(
		document: Uint8Array,
		writer: Uint8Array,
		session: Uint8Array,
		resumeAfter?: Uint8Array,
	): Promise<void> {
		await this.send(
			requestKinds.openSession,
			field(document),
			field(writer),
			field(session),
			reference(resumeAfter),
		);
	}

	/** Submits one operation through the unary path and returns its committed position. */
	public async submit(
		document: Uint8Array,
		writer: Uint8Array,
		session: Uint8Array,
		submission: Uint8Array,
		localSequenceNumber: number,
		payload: Uint8Array,
		referencePosition?: Uint8Array,
	): Promise<Uint8Array> {
		return this.submissionPosition(
			await this.wasm.request(
				this.submissionRequest(
					document,
					writer,
					session,
					submission,
					localSequenceNumber,
					payload,
					referencePosition,
				),
			),
		);
	}

	/** Encodes one submission request using the next monotonically increasing request ID. */
	public submissionRequest(
		document: Uint8Array,
		writer: Uint8Array,
		session: Uint8Array,
		submission: Uint8Array,
		localSequenceNumber: number,
		payload: Uint8Array,
		referencePosition?: Uint8Array,
	): Uint8Array {
		return frame(
			this.nextRequestId++,
			requestKinds.submit,
			field(document),
			field(writer),
			field(session),
			field(submission),
			u64(localSequenceNumber),
			reference(referencePosition),
			field(payload),
		);
	}

	/** Extracts the committed position from a submission acknowledgement. */
	public submissionPosition(response: Uint8Array): Uint8Array {
		return submittedPosition(response);
	}

	/** Publishes a summary digest as the document's latest snapshot. */
	public async publishSnapshot(
		document: Uint8Array,
		summaryDigest: Uint8Array,
		includesThrough?: Uint8Array,
		expectedParent?: Uint8Array,
	): Promise<void> {
		await this.send(
			requestKinds.publishSnapshot,
			field(document),
			reference(includesThrough),
			optionalField(expectedParent),
			field(summaryDigest),
		);
	}

	/** Returns the latest published summary digest, or undefined for a new document. */
	public async latestSummaryDigest(document: Uint8Array): Promise<Uint8Array | undefined> {
		return latestSnapshotPayload(
			await this.send(requestKinds.latestSnapshot, field(document)),
		);
	}

	/** Sends one unary request and advances the request ID. */
	private async send(kind: number, ...body: readonly Uint8Array[]): Promise<Uint8Array> {
		return this.wasm.request(frame(this.nextRequestId++, kind, ...body));
	}
}
