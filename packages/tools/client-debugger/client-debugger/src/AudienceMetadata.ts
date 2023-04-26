/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient } from "@fluidframework/protocol-definitions";

/**
 * Kind of audience member change.
 *
 * @internal
 */
export enum MemberChangeKind {
	/**
	 * An audience member was added.
	 */
	Added = "Added",

	/**
	 * An audience member was removed.
	 */
	Removed = "Removed",
}

/**
 * Metadata of clients within the Audience.
 *
 * @public
 */
export interface AudienceClientMetadata {
	/**
	 * Local users's clientId.
	 */
	clientId: string;

	/**
	 * Metadata about the client that was added or removed.
	 */
	client: IClient;
}
