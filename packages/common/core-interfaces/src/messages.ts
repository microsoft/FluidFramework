/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonableOrBinary } from "./jsonable.js";

/**
 * @public
 */
export type SignalContentType<T = unknown> = JsonableOrBinary<T>;

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ISignalEnvelope = {
	/**
	 * The target for the envelope, undefined for the container
	 */
	address?: string;

	/**
	 * Identifier for the signal being submitted.
	 */
	clientSignalSequenceNumber: number;

	/**
	 * The contents of the envelope
	 */
	contents: {
		type: string;
		content: SignalContentType;
	};
};
