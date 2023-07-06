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
import { assert } from "@fluidframework/common-utils";

export class MockAudience
	extends ServiceAudience<TinyliciousMember>
	implements ITinyliciousAudience
{
	protected createServiceMember(audienceMember: IClient): TinyliciousMember {
		const tinyliciousUser = audienceMember.user as TinyliciousUser;
		assert(
			tinyliciousUser !== undefined && typeof tinyliciousUser.name === "string",
			0x313 /* Specified user was not of type "TinyliciousUser". */,
		);

		return {
			userId: tinyliciousUser.id,
			userName: tinyliciousUser.name,
			connections: [],
		};
	}
}
