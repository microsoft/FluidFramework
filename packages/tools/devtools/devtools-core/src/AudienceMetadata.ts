/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IClient } from "@fluidframework/driver-definitions";

/**
 * Kind of audience member change.
 *
 * @internal
 */
export enum MemberChangeKind {
	/**
	 * An audience member joined.
	 */
	Joined = "Joined",

	/**
	 * An audience member left.
	 */
	Left = "Left",
}

/**
 * Metadata of clients within the Audience.
 *
 * @internal
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
