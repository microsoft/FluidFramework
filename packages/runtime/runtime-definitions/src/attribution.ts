/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IUser } from "@fluidframework/driver-definitions";

/**
 * AttributionKey representing a reference to some op in the op stream.
 * Content associated with this key aligns with content modified by that op.
 * @legacy
 * @alpha
 */
export interface OpAttributionKey {
	/**
	 * The type of attribution this key corresponds to.
	 *
	 * Keys currently all represent op-based attribution, so have the form `{ type: "op", key: sequenceNumber }`.
	 * Thus, they can be used with an `OpStreamAttributor` to recover timestamp/user information.
	 */
	type: "op";

	/**
	 * The sequenceNumber of the op this attribution key is for.
	 */
	seq: number;
}

/**
 * AttributionKey associated with content that was inserted while the container was in a detached state.
 *
 * @remarks Retrieving an {@link AttributionInfo} from content associated with detached attribution keys
 * is currently unsupported, as applications can effectively modify content anonymously while detached.
 * The runtime has no mechanism for reliably obtaining the user. It would be reasonable to start supporting
 * this functionality if the host provided additional context to their attributor or attach calls.
 * @legacy
 * @alpha
 */
export interface DetachedAttributionKey {
	type: "detached";

	/**
	 * Arbitrary discriminator associated with content inserted while detached.
	 *
	 * @remarks For now, the runtime assumes all content created while detached is associated
	 * with the same user/timestamp.
	 * We could weaken this assumption in the future with further API support and
	 * allow arbitrary strings or numbers as part of this key.
	 */
	id: 0;
}

/**
 * AttributionKey associated with content that has been made locally but not yet acked by the server.
 * @legacy
 * @alpha
 */
export interface LocalAttributionKey {
	type: "local";
}

/**
 * Can be indexed into the ContainerRuntime in order to retrieve {@link AttributionInfo}.
 * @legacy
 * @alpha
 */
export type AttributionKey = OpAttributionKey | DetachedAttributionKey | LocalAttributionKey;

/**
 * Attribution information associated with a change.
 * @legacy
 * @alpha
 */
export interface AttributionInfo {
	/**
	 * The user that performed the change.
	 */
	user: IUser;
	/**
	 * When the change happened.
	 */
	timestamp: number;
}
