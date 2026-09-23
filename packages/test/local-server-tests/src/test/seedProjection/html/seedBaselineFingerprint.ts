/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createHash } from "node:crypto";

import type { IBatchMessage } from "@fluidframework/container-definitions/internal";
import {
	MessageType,
	type IDocumentStorageService,
	type ISequencedDocumentMessage,
	type ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";

import type { IApplicationProjection } from "./externalSeedFile.js";
import { storeId } from "./nativeSeedBaseline.js";

/**
 * Immutable compatibility metadata in the native data-store summary, outside exported application content.
 * The initial native hash is computed before this blob is written, so it does not hash itself.
 */
export const seedBaselineBlobName = "seed-baseline.json";
export const seedBaselineMetadataKey = "seedBaseline";
export const seedBaselineHashVersion = "native-snapshot-sha256/1";

/** Only known loader/service traffic is exempt; legacy or future native envelopes still need proof. */
const loaderMessageTypes = new Set<string>(
	Object.values(MessageType).filter((type) => type !== MessageType.Operation),
);

/** Immutable identity of the native genesis, not a hash of the current edited document. */
export interface ISeedBaselineDescriptor {
	/** Digest of immutable source blob identities and the original source checkpoint. */
	readonly seedId: string;
	/**
	 * Application-owned rule identity, independent of the external format and native schema.
	 */
	readonly profileVersion: string;
	/** Version of native snapshot canonicalization and hashing. */
	readonly hashVersion: string;
	/** Canonical native genesis hash, computed before any live runtime or user edit. */
	readonly baselineHash: string;
}

/** Retained descriptor bytes are reusable only for the same persisted sidecar blob. */
export interface IRetainedSeedBaseline {
	readonly blobId: string;
	readonly descriptor: ISeedBaselineDescriptor;
}

/** Bind reconstruction to its source without incorporating the computed native hash into source identity. */
export function createSeedBaselineDescriptor(
	seed: IApplicationProjection,
	sourceSequenceNumber: number,
	profileVersion: string,
	baselineHash: string,
): ISeedBaselineDescriptor {
	const seedId = createHash("sha256")
		.update(
			JSON.stringify([
				seed.manifestId,
				seed.partBlobIds.first,
				seed.partBlobIds.second,
				sourceSequenceNumber,
			]),
		)
		.digest("hex");
	return parseSeedBaselineDescriptor({
		seedId,
		profileVersion,
		hashVersion: seedBaselineHashVersion,
		baselineHash,
	});
}

/** Validate the small versioned proof instead of accepting arbitrary metadata as an agreement. */
export function parseSeedBaselineDescriptor(value: unknown): ISeedBaselineDescriptor {
	if (
		typeof value !== "object" ||
		value === null ||
		!("seedId" in value) ||
		typeof value.seedId !== "string" ||
		!/^[0-9a-f]{64}$/u.test(value.seedId) ||
		!("profileVersion" in value) ||
		typeof value.profileVersion !== "string" ||
		value.profileVersion.length === 0 ||
		value.profileVersion.length > 256 ||
		!("hashVersion" in value) ||
		value.hashVersion !== seedBaselineHashVersion ||
		!("baselineHash" in value) ||
		typeof value.baselineHash !== "string" ||
		!/^[0-9a-f]{64}$/u.test(value.baselineHash) ||
		Object.keys(value).length !== 4
	) {
		throw new Error("Missing, malformed, or unsupported seed baseline fingerprint");
	}
	return Object.freeze({
		seedId: value.seedId,
		profileVersion: value.profileVersion,
		hashVersion: value.hashVersion,
		baselineHash: value.baselineHash,
	});
}

/** Compare the entire descriptor, including source identity and both version discriminators. */
export function sameSeedBaseline(
	a: ISeedBaselineDescriptor,
	b: ISeedBaselineDescriptor,
): boolean {
	return (
		a.seedId === b.seedId &&
		a.profileVersion === b.profileVersion &&
		a.hashVersion === b.hashVersion &&
		a.baselineHash === b.baselineHash
	);
}

/**
 * Locate the internal application identity beside the native SharedTree channel.
 * Readable projections do not carry or select the materialization profile.
 */
export function getSeedBaselineBlobId(snapshot: ISnapshotTree): string | undefined {
	return snapshot.trees[".channels"]?.trees[storeId]?.trees[".channels"]?.blobs[
		seedBaselineBlobName
	];
}

/**
 * Read persisted genesis identity from native state, never from exported application content.
 * Old snapshots without this internal identity require explicit conversion.
 */
export async function readSeedBaselineDescriptor(
	snapshot: ISnapshotTree,
	readBlob: IDocumentStorageService["readBlob"],
	retained?: IRetainedSeedBaseline,
): Promise<IRetainedSeedBaseline> {
	const blobId = getSeedBaselineBlobId(snapshot);
	if (blobId === undefined) {
		throw new Error("Native snapshot is missing its seed baseline fingerprint");
	}
	const descriptor = parseSeedBaselineDescriptor(
		retained?.blobId === blobId
			? retained.descriptor
			: JSON.parse(Buffer.from(await readBlob(blobId)).toString("utf8")),
	);
	return { blobId, descriptor };
}

/**
 * Fail-closed evidence available to the host before container close. Pending native work is captured,
 * not discarded or automatically replayed against an incompatible baseline.
 */
export class SeedBaselineMismatchError extends LoggingError {
	public readonly errorType = "seedBaselineMismatch";
	/** Captured native pending envelope and seed dependencies; not a complete loader-restoration string. */
	public pendingLocalState: unknown;
	/** Explicit capture failure, if capture was unavailable; never substitute an empty successful stash. */
	public pendingCaptureError: unknown;

	/**
	 * Retain mismatch evidence for application recovery while excluding operation and pending payloads from telemetry.
	 */
	public constructor(
		public readonly expected: ISeedBaselineDescriptor,
		public readonly received: unknown,
		public readonly packet: ISequencedDocumentMessage | undefined,
	) {
		super(
			"Seed baseline fingerprint mismatch; native operation was not applied",
			{
				expectedSeedId: expected.seedId,
				expectedProfileVersion: expected.profileVersion,
				expectedHashVersion: expected.hashVersion,
				expectedBaselineHash: expected.baselineHash,
				receivedDescriptor: JSON.stringify(descriptorTelemetry(received)),
				sequenceNumber: packet?.sequenceNumber,
				clientId: packet?.clientId ?? undefined,
			},
			new Set(["expected", "received", "packet", "pendingLocalState", "pendingCaptureError"]),
		);
		this.name = "SeedBaselineMismatchError";
	}
}

/** Log only bounded agreement fields, never arbitrary metadata, the operation payload, or pending user work. */
function descriptorTelemetry(value: unknown): Record<string, string> {
	const fields: Record<string, string> = {};
	if (typeof value !== "object" || value === null) return fields;
	for (const key of ["seedId", "profileVersion", "hashVersion", "baselineHash"]) {
		const field: unknown = Reflect.get(value, key);
		if (typeof field === "string") fields[key] = field.slice(0, 256);
	}
	return fields;
}

/**
 * Proof is repeated on EVERY physical runtime packet, including chunk fragments and retries.
 * This intentionally trades a bounded metadata overhead for stateless reconnect/replay validation:
 * no first-send flag, client-ID cache, or reliance on preserved inner compressed/grouped metadata.
 */
export class SeedBaselineProtocol {
	/**
	 * Use the same immutable genesis descriptor for every outgoing packet and incoming comparison.
	 */
	public constructor(public readonly descriptor: ISeedBaselineDescriptor) {}

	/** Preserve native metadata and reject a conflicting use of the reserved application metadata key. */
	public stampMetadata(
		metadata: Record<string, unknown> | undefined,
	): Record<string, unknown> {
		if (metadata !== undefined && Object.hasOwn(metadata, seedBaselineMetadataKey)) {
			this.validateProof(metadata[seedBaselineMetadataKey]);
		}
		return { ...metadata, [seedBaselineMetadataKey]: this.descriptor };
	}

	/** Called after runtime batching, grouping, compression, and every intermediate/final chunk emission. */
	public stampBatch(batch: IBatchMessage[]): IBatchMessage[] {
		return batch.map((message) => ({
			...message,
			metadata: this.stampMetadata(message.metadata),
		}));
	}

	/** Validate the transport envelope before native decompression, chunk assembly, batching, or DDS application. */
	public validateMessage(message: ISequencedDocumentMessage): void {
		if (loaderMessageTypes.has(message.type)) return;
		const metadata: unknown = message.metadata;
		const proof =
			typeof metadata === "object" && metadata !== null && seedBaselineMetadataKey in metadata
				? metadata[seedBaselineMetadataKey]
				: undefined;
		this.validateProof(proof, message);
	}

	/** Pending restoration also checks the proof before creating a native runtime or replaying local work. */
	public validateProof(proof: unknown, packet?: ISequencedDocumentMessage): void {
		let actual: ISeedBaselineDescriptor;
		try {
			actual = parseSeedBaselineDescriptor(proof);
		} catch {
			throw new SeedBaselineMismatchError(this.descriptor, proof, packet);
		}
		if (!sameSeedBaseline(this.descriptor, actual)) {
			throw new SeedBaselineMismatchError(this.descriptor, actual, packet);
		}
	}
}
