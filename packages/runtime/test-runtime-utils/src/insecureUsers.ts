/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "@fluidframework/driver-definitions";

/**
 * Insecure user definition.
 * @remarks It extends the base IUser interface with a `name` property.
 * @internal
 */
export interface IInsecureUser extends IUser {
	/**
	 * Name of the user making the connection to the service.
	 */
	name: string;
}
