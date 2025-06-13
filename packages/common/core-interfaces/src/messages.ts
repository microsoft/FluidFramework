/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A message that has a string `type` associated with `content`.
 *
 * @remarks
 * This type is meant to be used indirectly. Most commonly as a constraint
 * for generics of message structures.
 *
 * @legacy
 * @alpha
 */
export interface TypedMessage {
	/**
	 * The type of the message.
	 */
	type: string;

	/**
	 * The contents of the message.
	 */
	content: unknown;
}

/**
 * @internal
 *
 * @privateRemarks
 * `IRuntimeSignalEnvelope` is an interface that mirrors `ISignalEnvelope` for signals that come from an external
 * caller (not sent by a client—so no `clientBroadcastSignalSequenceNumber`) and are always addressed
 * to the Container (so no `address`).
 *
 * See at `server/routerlicious/packages/lambdas/src/utils/messageGenerator.ts`.
 */
export interface ISignalEnvelope<TMessage extends TypedMessage = TypedMessage> {
	/**
	 * The target for the envelope, undefined for the container
	 */
	address?: string;

	/**
	 * Signal tracking identifier for self submitted broadcast signals.
	 */
	clientBroadcastSignalSequenceNumber?: number;

	/**
	 * The contents of the envelope
	 */
	contents: TMessage;
}
