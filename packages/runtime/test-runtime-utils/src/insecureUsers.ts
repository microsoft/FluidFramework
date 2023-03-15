/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "@fluidframework/protocol-definitions";

/**
 * Insecure user definition.
 * @remarks It extends the base IUser interface with a `name` property.
 */
export interface IInsecureUser extends IUser {
	/**
	 * Name of the user making the connection to the service.
	 */
	name: string;
}
