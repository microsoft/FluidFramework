/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IClient, type IUser } from "@fluidframework/protocol-definitions";

import { type BaseMember, type BaseUser } from "./interfaces.js";

/**
 * Creates Azure-specific audience member.
 *
 * @remarks
 * The provided `audienceMember`'s {@link @fluidframework/protocol-definitions#IClient.user} must be an {@link BaseUser}.
 * @public
 */
export function createAzureAudienceMember(audienceMember: IClient): BaseMember {
	const user = audienceMember.user;
	assertIsBaseUser(user);

	return {
		userId: user.id,
		userName: user.name,
		connections: [],
		additionalDetails: user.additionalDetails,
	};
}

/**
 * Asserts that the provided {@link @fluidframework/protocol-definitions#IUser} is an {@link BaseUser}.
 */
function assertIsBaseUser(user: IUser): asserts user is BaseUser<unknown> {
	const maybeBaseUser = user as Partial<BaseUser>;
	const baseMessage = 'Provided user data was not an "BaseUser".';
	if (maybeBaseUser.id === undefined) {
		throw new TypeError(`${baseMessage} Missing required "id" property.`);
	}
	if (maybeBaseUser.name === undefined) {
		throw new TypeError(`${baseMessage} Missing required "name" property.`);
	}
}
