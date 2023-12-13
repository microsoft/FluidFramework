/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IClient } from "@fluidframework/protocol-definitions";
import { TinyliciousMember, TinyliciousUser } from "./interfaces";

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
