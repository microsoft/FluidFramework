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

export class ProtocolClient {
	private nextRequestId = 1n;

	public constructor(public readonly wasm: WasmProtocolClient) {}

	public async create(document: Uint8Array): Promise<void> {
		await this.send(requestKinds.create, field(document));
	}

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

	public async submit(
		document: Uint8Array,
		writer: Uint8Array,
		session: Uint8Array,
		submission: Uint8Array,
		localSequenceNumber: number,
		payload: Uint8Array,
		referencePosition?: Uint8Array,
	): Promise<Uint8Array> {
		return submittedPosition(
			await this.send(
				requestKinds.submit,
				field(document),
				field(writer),
				field(session),
				field(submission),
				u64(localSequenceNumber),
				reference(referencePosition),
				field(payload),
			),
		);
	}

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

	public async latestSummaryDigest(document: Uint8Array): Promise<Uint8Array | undefined> {
		return latestSnapshotPayload(
			await this.send(requestKinds.latestSnapshot, field(document)),
		);
	}

	private async send(kind: number, ...body: readonly Uint8Array[]): Promise<Uint8Array> {
		return this.wasm.request(frame(this.nextRequestId++, kind, ...body));
	}
}
