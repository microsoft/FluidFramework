/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISignalMessage, ITree } from "@fluidframework/protocol-definitions";

/**
 * An envelope wraps the contents with the intended target.
 *
 * @public
 */
export interface IEnvelope {
	/**
	 * The target for the envelope
	 */
	address: string;

	/**
	 * The contents of the envelope
	 */
	contents: any;
}

/**
 * @public
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
		content: any;
	};
}

/**
 * An {@link @fluidframework/protocol-definitions#ISignalMessage} with its type.
 *
 * @public
 */
export interface IInboundSignalMessage extends ISignalMessage {
	type: string;
}

/**
 * Message sent by a client attaching a local data structure.
 *
 * @remarks Contains snapshot of data structure which is the current state of this data structure.
 *
 * @public
 */
export interface IAttachMessage {
	/**
	 * The identifier for the object
	 */
	id: string;

	/**
	 * The type of object
	 */
	type: string;

	/**
	 * Initial snapshot of the document (contains ownership)
	 */
	snapshot: ITree;
}

/**
 * @remarks
 * This type should be used when reading an incoming attach op,
 * but it should not be used when creating a new attach op.
 * Older versions of attach messages could have null snapshots,
 * so this gives correct typings for writing backward compatible code.
 *
 * @public
 */
export type InboundAttachMessage = Omit<IAttachMessage, "snapshot"> & {
	snapshot: IAttachMessage["snapshot"] | null;
};
