/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ServiceAudience } from "@fluidframework/fluid-static";
import { IClient } from "@fluidframework/protocol-definitions";
import { ITinyliciousAudience, TinyliciousMember, TinyliciousUser } from "./interfaces";

/**
 * {@inheritDoc ITinyliciousAudience}
 *
 * @public
 * @deprecated use {@link ITinyliciousAudience} instead
 */
export class TinyliciousAudience
	extends ServiceAudience<TinyliciousMember>
	implements ITinyliciousAudience
{
	/**
	 * @internal
	 */
	protected createServiceMember(audienceMember: IClient): TinyliciousMember {
		return createTinyliciousAudienceMember(audienceMember);
	}
}

export function createTinyliciousAudienceMember(audienceMember: IClient): TinyliciousMember {
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
