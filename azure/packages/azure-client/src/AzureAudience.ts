/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import { ServiceAudience } from "@fluidframework/fluid-static";
import { type IClient } from "@fluidframework/protocol-definitions";

import { type AzureMember, type AzureUser, type IAzureAudience } from "./interfaces";

/**
 * Azure-specific {@link @fluidframework/fluid-static#ServiceAudience} implementation.
 *
 * @remarks Operates in terms of {@link AzureMember}s.
 *
 * @public
 * @deprecated This class will be removed. use {@link IAzureAudience} instead
 */
export class AzureAudience extends ServiceAudience<AzureMember> implements IAzureAudience {
	/**
	 * Creates a {@link @fluidframework/fluid-static#ServiceAudience} from the provided
	 * {@link @fluidframework/protocol-definitions#IClient | audience member}.
	 *
	 * @param audienceMember - Audience member for which the `ServiceAudience` will be generated.
	 * Note: its {@link @fluidframework/protocol-definitions#IClient.user} is required to be an {@link AzureUser}.
	 *
	 * @internal
	 */
	protected createServiceMember(audienceMember: IClient): AzureMember {
		return createAzureAudienceMember(audienceMember);
	}
}

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
