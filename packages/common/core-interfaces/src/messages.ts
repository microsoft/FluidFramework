/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Note: IRuntimeSignalEnvelope is an interface that mirrors ISignalEnvelope for signals that come from an external
// caller (not sent by a client (so no 'clientBroadcastSignalSequenceNumber') and are always addressed
// to the Container (so no 'address'):

//  interface IRuntimeSignalEnvelope {
// 		contents: {
// 			type: string;
// 			content: any;
// 		};
// 	}
//
// Make sure to reflect changes at 'server/routerlicious/packages/lambdas/src/utils/messageGenerator.ts'.

/**
 * @internal
 */
export interface ISignalEnvelope {
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
	contents: {
		type: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		content: any;
	};
}
