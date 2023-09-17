/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ServiceAudience } from "@fluidframework/fluid-static";
import { IClient } from "@fluidframework/protocol-definitions";

import { AzureMember, AzureUser, IAzureAudience } from "./interfaces";

/**
 * Azure-specific {@link @fluidframework/fluid-static#ServiceAudience | ServiceAudience} implementation.
 *
 * @remarks
 * Operates in terms of {@link AzureMember | AzureMembers}.
 *
 * @public
 * @see {@link IAzureAudience} for additional details.
 */
export class AzureAudience extends ServiceAudience<AzureMember> implements IAzureAudience {
	/**
	 * Creates a {@link @fluidframework/fluid-static#ServiceAudience | ServiceAudience} from the provided
	 * {@link @fluidframework/protocol-definitions#IClient | IClient audience member}.
	 *
	 * @param audienceMember - Audience member for which the `ServiceAudience` will be generated.
	 * @remarks
	 * {@link @fluidframework/protocol-definitions#IClient.user | user} is required to be an {@link AzureUser | AzureUser}.
	 * @internal
	 * @returns An instance of {@link AzureMember | AzureMember}.
	 * @throws Will throw an error if the provided user is not an AzureUser.
	 */
	protected createServiceMember(audienceMember: IClient): AzureMember {
		const azureUser = audienceMember.user as AzureUser;
		assert(azureUser?.name !== undefined, 'Provided user was not an "AzureUser".');

		return {
			userId: audienceMember.user.id,
			userName: azureUser.name,
			connections: [],
			additionalDetails: azureUser.additionalDetails as unknown,
		};
	}
}
