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
	flushPendingSubmissions(): void;
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

/**
 * Keeps opt-in dispatch private without adding protocol hooks to the legacy base-class API.
 */
export const sharedObjectProtocols = new WeakMap<object, SharedObjectProtocol>();
