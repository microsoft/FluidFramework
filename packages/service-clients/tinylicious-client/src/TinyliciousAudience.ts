/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { type IClient } from "@fluidframework/protocol-definitions";
import { type TinyliciousMember, type TinyliciousUser } from "./interfaces.js";

/**
 * Creates a {@link TinyliciousMember} for the provided client.
 *
 * @remarks
 * Assumes that the provided client's {@link @fluidframework/protocol-definitions#IClient.user} is of type {@link TinyliciousUser}.
 * This function will fail if that is not the case.
 */
export function createTinyliciousAudienceMember(audienceMember: IClient): TinyliciousMember {
	const tinyliciousUser = audienceMember.user as Partial<TinyliciousUser>;
	// AB#7448 to reenable this stronger check.  Relaxing to mitigate a bug that the name may be missing.
	// assert(
	// 	tinyliciousUser !== undefined &&
	// 		typeof tinyliciousUser.id === "string" &&
	// 		typeof tinyliciousUser.name === "string",
	// 	0x313 /* Specified user was not of type "TinyliciousUser". */,
	// );
	assert(
		tinyliciousUser !== undefined && typeof tinyliciousUser.id === "string",
		0x313 /* Specified user was not of type "TinyliciousUser". */,
	);

	return {
		userId: tinyliciousUser.id,
		// AB#7448 to remove this cast after the check above is strengthened again.
		userName: tinyliciousUser.name as string,
		connections: [],
	};
}
