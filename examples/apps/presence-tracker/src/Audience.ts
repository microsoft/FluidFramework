/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient } from "@fluidframework/protocol-definitions";
import type { AzureMember, AzureUser } from "@fluidframework/azure-client/internal";

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
