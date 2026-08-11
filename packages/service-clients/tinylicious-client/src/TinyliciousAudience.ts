/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IClient } from "@fluidframework/driver-definitions";

import type { TinyliciousMember, TinyliciousUser } from "./interfaces.js";

/**
 * Creates a {@link TinyliciousMember} for the provided client.
 *
 * @remarks
 * Assumes that the provided client's {@link @fluidframework/protocol-definitions#IClient.user} is of type {@link TinyliciousUser}.
 * This function will fail if that is not the case.
 */
export function createTinyliciousAudienceMember(audienceMember: IClient): TinyliciousMember {
	const tinyliciousUser = audienceMember.user as Partial<TinyliciousUser>;
	assert(
		tinyliciousUser !== undefined &&
			typeof tinyliciousUser.id === "string" &&
			typeof tinyliciousUser.name === "string",
		0x313 /* Specified user was not of type "TinyliciousUser". */,
	);

	return {
		id: tinyliciousUser.id,
		name: tinyliciousUser.name,
		connections: [],
	};
}
