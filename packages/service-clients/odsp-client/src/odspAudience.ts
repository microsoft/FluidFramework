/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import { type IClient } from "@fluidframework/protocol-definitions";

import { type OdspMember, OdspUser } from "./interfaces";

export function createOdspAudienceMember(audienceMember: IClient): OdspMember {
	const user = audienceMember.user as OdspUser;
	assert(
		user.name !== undefined || user.id !== undefined || user.oid !== undefined,
		0x836 /* Provided user was not an "OdspUser". */,
	);

	return {
		userId: user.oid,
		name: user.name,
		email: user.id,
		connections: [],
	};
}
