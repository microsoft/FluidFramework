/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeMessageCollection } from "@fluidframework/runtime-definitions/internal";

/**
 * An instance-specific protocol at the boundary before handle decoding and DDS events.
 * This is not part of the subclass API: only shared infrastructure registers protocols.
 *
 * @remarks
 * Separates channel-level message processing from the DDS-specific hooks in SharedObjectCore.
 * A protocol can process messages owned by shared infrastructure without passing them to the DDS.
 * It must make that distinction consistently during processing, stashed-op replay, resubmission, and rollback.
 * Keeping these paths together avoids requiring each DDS to implement the same channel-level behavior.
 *
 * SharedObjectCore retains ownership of handle serialization, DDS event delivery, and the subclass hooks.
 * The callbacks below continue those existing paths for ordinary DDS messages.
 * Protocol implementations do not need access to the protected subclass API.
 */
export interface SharedObjectProtocol {
	/**
	 * Prepares local content before handles are bound or encoded, including while detached.
	 * @returns Content to pass through the existing submission path, including handle binding or encoding.
	 */
	prepareLocalMessage(content: unknown): unknown;

	/**
	 * Coordinates attached submission after handles have been bound or encoded.
	 * @param content - The prepared content, before handle encoding.
	 * @param submit - Submits the already prepared runtime payload with its original local metadata.
	 */
	submitLocalMessage(content: unknown, submit: () => void): void;

	/**
	 * Processes prepared local content while detached, without submitting to the runtime.
	 * The default protocol does nothing: detached edits are already represented in the DDS state.
	 */
	submitWhileDetached(content: unknown, metadata: unknown): void;

	/**
	 * Processes sequenced messages before handle decoding or DDS events.
	 * @param deliver - Continues handle decoding, pre-op events, DDS processing, and op events.
	 * Deliver ordinary messages in sequence order with their envelope and per-message metadata preserved.
	 */
	processMessages(
		messages: IRuntimeMessageCollection,
		deliver: (messages: IRuntimeMessageCollection) => void,
	): void;

	/**
	 * Processes stashed content before handle decoding.
	 * @param apply - Decodes handles and invokes the DDS stashed-op hook.
	 */
	applyStashedOp(content: unknown, apply: (content: unknown) => void): void;

	/**
	 * Coordinates resubmission of a pending op.
	 * @param reSubmit - Invokes the DDS resubmit or squash hook selected by SharedObjectCore.
	 * This is not a direct runtime submission; the DDS hook decides what to submit.
	 */
	reSubmit(
		content: unknown,
		metadata: unknown,
		reSubmit: (content: unknown, metadata: unknown) => void,
	): void;

	/**
	 * Coordinates rollback of a pending op.
	 * @param rollback - Invokes the DDS rollback hook with the supplied content and local metadata, without decoding handles.
	 */
	rollback(
		content: unknown,
		metadata: unknown,
		rollback: (content: unknown, metadata: unknown) => void,
	): void;

	/**
	 * Notifies the protocol after SharedObjectCore records the error that closes the object.
	 * This allows protocol-owned work to end without making the protocol responsible for closing the DDS.
	 */
	close(error: unknown): void;
}

/**
 * Preserves the existing DDS paths by forwarding directly to each callback.
 * It has no per-instance state; detached submissions and close notifications require no action.
 */
class DefaultSharedObjectProtocol implements SharedObjectProtocol {
	public prepareLocalMessage(content: unknown): unknown {
		return content;
	}

	public submitWhileDetached(content: unknown, metadata: unknown): void {}

	public submitLocalMessage(content: unknown, submit: () => void): void {
		submit();
	}

	public processMessages(
		messages: IRuntimeMessageCollection,
		deliver: (messages: IRuntimeMessageCollection) => void,
	): void {
		deliver(messages);
	}

	public applyStashedOp(content: unknown, apply: (content: unknown) => void): void {
		apply(content);
	}

	public reSubmit(
		content: unknown,
		metadata: unknown,
		reSubmit: (content: unknown, metadata: unknown) => void,
	): void {
		reSubmit(content, metadata);
	}

	public rollback(
		content: unknown,
		metadata: unknown,
		rollback: (content: unknown, metadata: unknown) => void,
	): void {
		rollback(content, metadata);
	}

	public close(error: unknown): void {}
}

export const defaultSharedObjectProtocol: SharedObjectProtocol =
	new DefaultSharedObjectProtocol();

/**
 * Keeps opt-in dispatch private without adding protocol hooks to the legacy base-class API.
 * Instances without a registration share the stateless default protocol.
 */
export const sharedObjectProtocols = new WeakMap<object, SharedObjectProtocol>();

export function getSharedObjectProtocol(target: object): SharedObjectProtocol {
	return sharedObjectProtocols.get(target) ?? defaultSharedObjectProtocol;
}
