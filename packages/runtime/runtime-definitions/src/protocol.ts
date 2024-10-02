/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITree, ISignalMessage } from "@fluidframework/driver-definitions/internal";

/**
 * An envelope wraps the contents with the intended target
 * @legacy
 * @alpha
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
 * Represents ISignalMessage with its type.
 * @legacy
 * @alpha
 */
export interface IInboundSignalMessage extends ISignalMessage {
	readonly type: string;
}

/**
 * Message send by client attaching local data structure.
 * Contains snapshot of data structure which is the current state of this data structure.
 * @legacy
 * @alpha
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
 * This type should be used when reading an incoming attach op,
 * but it should not be used when creating a new attach op.
 * Older versions of attach messages could have null snapshots,
 * so this gives correct typings for writing backward compatible code.
 * @legacy
 * @alpha
 */
export type InboundAttachMessage = Omit<IAttachMessage, "snapshot"> & {
	snapshot: IAttachMessage["snapshot"] | null;
};
