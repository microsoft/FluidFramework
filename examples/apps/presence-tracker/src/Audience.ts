/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AzureMember } from "@fluidframework/azure-client";
import type { AzureUser } from "@fluidframework/azure-client/internal";
import { IClient } from "@fluidframework/driver-definitions";

export function createMockServiceMember(audienceMember: IClient): AzureMember {
	const azureUser = audienceMember.user as AzureUser;

	if (azureUser === undefined) {
		throw new Error("Specified user was not of type azureUser");
	}

	return {
		id: azureUser.id,
		name: azureUser.name,
		connections: [],
	};
}
