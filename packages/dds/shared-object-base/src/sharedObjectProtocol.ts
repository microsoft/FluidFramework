/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeMessageCollection } from "@fluidframework/runtime-definitions/internal";

/**
 * An instance-specific protocol at the boundary before handle decoding and DDS events.
 * This is not part of the subclass API: only shared infrastructure registers protocols.
 */
export interface SharedObjectProtocol {
	prepareLocalMessage(content: unknown): unknown;
	submitWhileDetached(content: unknown, metadata: unknown): void;
	processMessages(
		messages: IRuntimeMessageCollection,
		deliver: (messages: IRuntimeMessageCollection) => void,
	): void;
	applyStashedOp(content: unknown, apply: (content: unknown) => void): void;
	reSubmit(
		content: unknown,
		metadata: unknown,
		submit: (content: unknown, metadata: unknown) => void,
	): void;
	rollback(
		content: unknown,
		metadata: unknown,
		rollback: (content: unknown, metadata: unknown) => void,
	): void;
	close(error: unknown): void;
}

class DefaultSharedObjectProtocol implements SharedObjectProtocol {
	public prepareLocalMessage(content: unknown): unknown {
		return content;
	}

	public submitWhileDetached(content: unknown, metadata: unknown): void {}

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
		submit: (content: unknown, metadata: unknown) => void,
	): void {
		submit(content, metadata);
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
 */
export const sharedObjectProtocols = new WeakMap<object, SharedObjectProtocol>();

export function getSharedObjectProtocol(target: object): SharedObjectProtocol {
	return sharedObjectProtocols.get(target) ?? defaultSharedObjectProtocol;
}
