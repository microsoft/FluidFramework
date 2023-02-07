/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IOutboundMessage } from "./Messages";

/**
 * Posts the provided message to the window (globalThis).
 *
 * @remarks Thin wrapper to provide some message-wise type-safety.
 *
 * @privateRemarks TODO: remove from package exports.
 *
 * @internal
 */
export function postWindowMessage<TMessage extends IOutboundMessage>(message: TMessage): void {
	globalThis.postMessage(message, "*"); // TODO: verify target is okay
}
