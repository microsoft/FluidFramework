/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base user definition. It is valid to extend this interface when adding new details to the user object.
 * @public
 */
export interface IUser {
	/**
	 * Unique identifier of the user session. This ID is established on each connection with the service.
	 */
	id: string;
}
