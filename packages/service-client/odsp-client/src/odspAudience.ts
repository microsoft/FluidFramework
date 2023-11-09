/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import { ServiceAudience } from "@fluidframework/fluid-static";
import { type IClient } from "@fluidframework/protocol-definitions";

import { type OdspMember, type IOdspAudience, OdspUser } from "./interfaces";

/**
 * @alpha
 */
export class OdspAudience extends ServiceAudience<OdspMember> implements IOdspAudience {
	protected createServiceMember(audienceMember: IClient): OdspMember {
		const user = audienceMember.user as OdspUser;
		assert(user?.name !== undefined, 'Provided user was not an "AzureUser".');

		return {
			userId: audienceMember.user.id,
			userName: user.name,
			connections: [],
		};
	}
}
