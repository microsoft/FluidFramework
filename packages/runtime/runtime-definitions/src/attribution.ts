/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IUser } from "@fluidframework/protocol-definitions";

/**
 * Can be indexed into the ContainerRuntime in order to retrieve {@link AttributionInfo}.
 * @alpha
 */
export interface AttributionKey {
	/**
	 * The type of attribution this key corresponds to.
	 *
	 * Keys currently all represent op-based attribution, so have the form `{ type: "op", key: sequenceNumber }`.
	 * Thus, they can be used with an `OpStreamAttributor` to recover timestamp/user information.
	 *
	 * @remarks - If we want to support different types of attribution, a reasonable extensibility point is to make
	 * AttributionKey a discriminated union on the 'type' field. This would empower
	 * consumers with the ability to implement different attribution policies.
	 */
	type: "op";

	/**
	 * The sequenceNumber of the op this attribution key is for.
	 */
	seq: number;
}

/**
 * Attribution information associated with a change.
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
