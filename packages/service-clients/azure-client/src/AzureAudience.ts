/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IClient, type IUser } from "@fluidframework/protocol-definitions";
import { type AzureMember, type AzureUser } from "./interfaces.js";

/**
 * Creates Azure-specific audience member.
 *
 * @remarks
 * The provided `audienceMember`'s {@link @fluidframework/protocol-definitions#IClient.user} must be an {@link AzureUser}.
 */
export function createAzureAudienceMember(audienceMember: IClient): AzureMember {
	const user = audienceMember.user;
	assertIsAzureUser(user);

	return {
		userId: user.id,
		userName: user.name,
		connections: [],
		additionalDetails: user.additionalDetails,
	};
}

/**
 * Asserts that the provided {@link @fluidframework/protocol-definitions#IUser} is an {@link AzureUser}.
 */
function assertIsAzureUser(user: IUser): asserts user is AzureUser<unknown> {
	const maybeAzureUser = user as Partial<AzureUser>;
	const baseMessage = 'Provided user data was not an "AzureUser".';
	if (maybeAzureUser.id === undefined) {
		throw new TypeError(`${baseMessage} Missing required "id" property.`);
	}
	if (maybeAzureUser.name === undefined) {
		throw new TypeError(`${baseMessage} Missing required "name" property.`);
	}
}
