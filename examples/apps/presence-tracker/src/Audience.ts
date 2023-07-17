/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient } from "@fluidframework/protocol-definitions";
import { ServiceAudience } from "fluid-framework";
import {
	ITinyliciousAudience,
	TinyliciousMember,
	TinyliciousUser,
} from "@fluidframework/tinylicious-client";

export class MockAudience
	extends ServiceAudience<TinyliciousMember>
	implements ITinyliciousAudience
{
	protected createServiceMember(audienceMember: IClient): TinyliciousMember {
		const tinyliciousUser = audienceMember.user as TinyliciousUser;

		if (tinyliciousUser === undefined) {
			throw new Error("Specified user was not of type TinyliciousUser");
		}

		return {
			userId: tinyliciousUser.id,
			userName: tinyliciousUser.name,
			connections: [],
		};
	}
}
