/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import { type IClient } from "@fluidframework/protocol-definitions";

import { type AzureMember, type AzureUser } from "./interfaces";

/**
 * Creates Azure-specific audience member
 */
export function createAzureAudienceMember(audienceMember: IClient): AzureMember {
	const azureUser = audienceMember.user as AzureUser;
	assert(azureUser?.name !== undefined, 'Provided user was not an "AzureUser".');

	return {
		userId: audienceMember.user.id,
		userName: azureUser.name,
		connections: [],
		additionalDetails: azureUser.additionalDetails as unknown,
	};
}
