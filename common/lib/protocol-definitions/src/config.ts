/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Key value store of service configuration properties provided to the client as part of connection.
 * @public
 */
export interface IClientConfiguration {
	/**
	 * Max message size the server will accept before requiring chunking.
	 */
	maxMessageSize: number;

	/**
	 * Server-defined ideal block size for storing snapshots.
	 */
	blockSize: number;

	/**
	 * noopTimeFrequency & noopCountFrequency control how often a client with "write" connection needs to send
	 * noop messages in case no other ops are being sent. Any op (including noops) result in client
	 * communicating its reference sequence number to the relay service, which can recalculate MSN based on new info.
	 * Clients send noops when either noopTimeFrequency ms elapsed from receiving the last op or when receiving
	 * noopCountFrequency ops and only if the client did not have a chance to communicate its reference sequence
	 * number via regular ops.
	 * 'Infinity' will disable this feature and if no value is provided, the client choses some reasonable value.
	 */
	noopTimeFrequency?: number;

	/**
	 * Set min op frequency with which noops would be sent in case of an active connection which is not sending any op.
	 * See {@link IClientConfiguration#noopTimeFrequency} for more details.
	 * 'Infinity' will disable this feature and if no value is provided, the client choses some reasonable value.
	 */
	noopCountFrequency?: number;
}
