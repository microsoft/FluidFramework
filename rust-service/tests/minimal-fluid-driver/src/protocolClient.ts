/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { WasmProtocolClient } from "./wasmClient.js";

/** Typed Sea lifecycle facade used by the Fluid adapter. */
export class ProtocolClient {
	public constructor(public readonly wasm: WasmProtocolClient) {}

	public create(document: Uint8Array): Promise<void> {
		return this.wasm.create(document);
	}

	public openSession(
		document: Uint8Array,
		writer: Uint8Array,
		session: Uint8Array,
		resumeAfter?: Uint8Array,
	): Promise<void> {
		return this.wasm.openSession(document, writer, session, resumeAfter);
	}

	public submit(
		document: Uint8Array,
		writer: Uint8Array,
		session: Uint8Array,
		submission: Uint8Array,
		localSequenceNumber: number,
		payload: Uint8Array,
		referencePosition?: Uint8Array,
	): Promise<Uint8Array> {
		return this.wasm.submitEvent(
			document,
			writer,
			session,
			submission,
			localSequenceNumber,
			payload,
			referencePosition,
		);
	}

	public publishSnapshot(
		document: Uint8Array,
		root: Uint8Array,
		atEvent?: Uint8Array,
		expectedParent?: Uint8Array,
	): Promise<Uint8Array> {
		void document;
		return this.wasm.publishSnapshotRoot(
			concatenate(
				new Uint8Array([1]),
				expectedParent ?? new Uint8Array(),
				atEvent ?? new Uint8Array(),
				root,
			),
			expectedParent,
			atEvent,
			root,
		);
	}

	public async latestSummaryDigest(_document: Uint8Array): Promise<Uint8Array | undefined> {
		return (await this.wasm.latestSnapshot())?.root;
	}

	public latestSnapshot() {
		return this.wasm.latestSnapshot();
	}

	public snapshot(id: Uint8Array) {
		return this.wasm.snapshot(id);
	}
}

function concatenate(...values: readonly Uint8Array[]): Uint8Array {
	const result = new Uint8Array(values.reduce((length, value) => length + value.length, 0));
	let offset = 0;
	for (const value of values) {
		result.set(value, offset);
		offset += value.length;
	}
	return result;
}
