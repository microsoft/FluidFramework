/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentMessage,
	IResolvedUrl,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";

import type { ProjectedOperation } from "./wasmClient.js";

/**
 * UTF-8 encoder for protocol identities, payloads, and summary paths.
 * @internal
 */
export const encoder = new TextEncoder();
/**
 * UTF-8 decoder for Fluid operation and summary payloads.
 * @internal
 */
export const decoder = new TextDecoder();
/**
 * Numeric Fluid summary node kinds accepted by the minimal full-tree adapter.
 * @internal
 */
export const summaryType = { tree: 1, blob: 2 } as const;
/**
 * Synthetic member identity used for read-first service replacement.
 * @internal
 */
export const remoteClientId = "remote-service-client";
/**
 * Synthetic member identity used for independently connected write clients.
 * @internal
 */
export const externalClientId = "external-service-client";
/**
 * Number of initial join messages preceding application operations.
 * @internal
 */
export const applicationSequenceOffset = 2;
export const defaultSubscriptionBatchMaxOperations = 64;
export const defaultSubscriptionBatchMaxPayloadBytes = 1024 * 1024;

/**
 * Listener shape used by the minimal event emitter.
 * @internal
 */
export type Listener = (...args: readonly unknown[]) => void;

/**
 * Minimal event emitter implementing the Fluid driver event methods.
 * @internal
 */
export class Events {
	/** Event listeners grouped by Fluid event name. */
	private readonly listeners = new Map<string, Set<Listener>>();

	/** Registers a persistent listener. */
	protected addListener(event: string, listener: Listener): this {
		const listeners = this.listeners.get(event) ?? new Set<Listener>();
		listeners.add(listener);
		this.listeners.set(event, listeners);
		return this;
	}

	/** Registers a listener that removes itself before invocation. */
	protected onceListener(event: string, listener: Listener): this {
		const once = (...args: readonly unknown[]): void => {
			this.removeListener(event, once);
			listener(...args);
		};
		return this.addListener(event, once);
	}

	/** Removes a previously registered listener. */
	protected removeListener(event: string, listener: Listener): this {
		this.listeners.get(event)?.delete(listener);
		return this;
	}

	/** Invokes the current listener set for an event. */
	protected emit(event: string, ...args: readonly unknown[]): void {
		for (const listener of this.listeners.get(event) ?? []) {
			listener(...args);
		}
	}
}

/**
 * Converts bytes to the lowercase hexadecimal identifiers exposed by Fluid storage.
 * @internal
 */
export function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

/**
 * Parses a nonempty even-length hexadecimal identity.
 * @internal
 */
export function hexToBytes(value: string): Uint8Array {
	if (value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(value)) {
		throw new Error(`invalid hexadecimal identity: ${value}`);
	}
	return Uint8Array.from(value.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
}

/**
 * Encodes the resolved Fluid document ID for protocol requests.
 * @internal
 */
export function documentId(resolvedUrl: IResolvedUrl): Uint8Array {
	return hexToBytes(resolvedUrl.id);
}

/**
 * Compares byte strings lexicographically for deterministic summary ordering.
 * @internal
 */
export function compareBytes(left: Uint8Array, right: Uint8Array): number {
	const length = Math.min(left.length, right.length);
	for (let index = 0; index < length; index++) {
		const difference = (left.at(index) ?? 0) - (right.at(index) ?? 0);
		if (difference !== 0) {
			return difference;
		}
	}
	return left.length - right.length;
}

/**
 * Tests byte-string identity without allocating an encoded key.
 * @internal
 */
export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/**
 * Document-service state preserved across read-to-write replacement and reconnect.
 * @internal
 */
export interface DeltaConnectionLifecycle {
	/** Logical Fluid client identity represented by this service. */
	readonly clientId: string;
	/** Synthetic identity assigned to operations from other writers. */
	readonly remoteClientId: string;
	/** Stable protocol writer identity. */
	readonly writer: Uint8Array;
	/** Last projected cursor consumed by reads or subscriptions. */
	cursor: Uint8Array | undefined;
	/** Last committed local submission position. */
	lastPosition: Uint8Array | undefined;
	/** Next synthetic client sequence number for a remote writer. */
	remoteClientSequenceNumber: number;
	/** Stable synthetic sequence numbers keyed by remote operation position. */
	readonly remoteSequenceNumbers: Map<string, number>;
}

/**
 * Projects a service operation into Fluid's sequenced document-message shape.
 * @internal
 */
export function toSequenced(
	operation: ProjectedOperation,
	localWriter?: Uint8Array,
	localClientId?: string,
	projectedRemoteClientId = remoteClientId,
	remoteClientSequenceNumber = Number(operation.sequenceNumber),
): ISequencedDocumentMessage {
	if (operation.eventType !== undefined) {
		const clientId = decoder.decode(operation.session);
		const common = {
			sequenceNumber: Number(operation.sequenceNumber),
			minimumSequenceNumber: Number(operation.minimumSequenceNumber ?? 0n),
			timestamp: 0,
		};
		if (operation.eventType === "application") {
			const message = JSON.parse(decoder.decode(operation.payload)) as IDocumentMessage;
			return { ...message, ...common, clientId };
		}
		const readOnly = operation.membershipMode === "read";
		return {
			...common,
			clientId: null,
			clientSequenceNumber: -1,
			referenceSequenceNumber: -1,
			type: readOnly
				? MessageType.NoOp
				: operation.eventType === "joined"
					? MessageType.ClientJoin
					: MessageType.ClientLeave,
			contents: null,
			data:
				operation.eventType === "joined"
					? JSON.stringify({ clientId, detail: JSON.parse(decoder.decode(operation.payload)) })
					: JSON.stringify(clientId),
		};
	}
	const message = JSON.parse(decoder.decode(operation.payload)) as IDocumentMessage;
	const isLocal =
		localWriter !== undefined &&
		localClientId !== undefined &&
		bytesEqual(operation.writer, localWriter);
	return {
		...message,
		clientId: isLocal ? localClientId : projectedRemoteClientId,
		clientSequenceNumber: isLocal ? message.clientSequenceNumber : remoteClientSequenceNumber,
		sequenceNumber: Number(operation.sequenceNumber) + applicationSequenceOffset,
		minimumSequenceNumber: applicationSequenceOffset,
		timestamp: 0,
	};
}

/**
 * Projects an operation using identities and cursors shared by one document service.
 * @internal
 */
export function projectOperation(
	lifecycle: DeltaConnectionLifecycle,
	operation: ProjectedOperation,
): ISequencedDocumentMessage {
	const isLocal = bytesEqual(operation.writer, lifecycle.writer);
	let remoteSequenceNumber = lifecycle.remoteClientSequenceNumber;
	if (!isLocal) {
		const position = bytesToHex(operation.position);
		remoteSequenceNumber = lifecycle.remoteSequenceNumbers.get(position) ?? 0;
		if (remoteSequenceNumber === 0) {
			remoteSequenceNumber = ++lifecycle.remoteClientSequenceNumber;
			lifecycle.remoteSequenceNumbers.set(position, remoteSequenceNumber);
		}
	}
	return toSequenced(
		operation,
		lifecycle.writer,
		lifecycle.clientId,
		lifecycle.remoteClientId,
		remoteSequenceNumber,
	);
}
