/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
