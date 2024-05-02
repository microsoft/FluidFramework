/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { Jsonable } from "./jsonable.js";

/**
 * Content type of signal payload
 * @public
 */
export type SignalContentType = Jsonable;

/**
 * @internal
 */
export interface ISignalEnvelope {
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
}
