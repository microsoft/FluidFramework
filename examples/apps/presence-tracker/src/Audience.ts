/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient } from "@fluidframework/protocol-definitions";
import { TinyliciousMember, TinyliciousUser } from "@fluidframework/tinylicious-client/internal";

export function createMockServiceMember(audienceMember: IClient): TinyliciousMember {
	const tinyliciousUser = audienceMember.user as TinyliciousUser;

	if (tinyliciousUser === undefined) {
		throw new Error("Specified user was not of type TinyliciousUser");
	}

	return {
		id: tinyliciousUser.id,
		name: tinyliciousUser.name,
		connections: [],
	};
}
