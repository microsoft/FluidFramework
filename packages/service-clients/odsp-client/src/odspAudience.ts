/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import { type IClient } from "@fluidframework/protocol-definitions";

import { type OdspMember } from "./interfaces";

/**
 * Since ODSP provides user names, email and oids for all of its members, we extend the
 * {@link @fluidframework/protocol-definitions#IMember} interface to include this service-specific value.
 * @internal
 */
interface OdspUser {
	/**
	 * The user's email address
	 */
	email: string;
	/**
	 * The user's name
	 */
	name: string;
	/**
	 * The object ID (oid). It is a unique identifier assigned to each user, group, or other entity within AAD or another Microsoft 365 service. It is a GUID that uniquely identifies the object. When making Microsoft Graph API calls, you might need to reference or manipulate objects within the directory, and the `oid` is used to identify these objects.
	 */
	oid: string;
}

export function createOdspAudienceMember(audienceMember: IClient): OdspMember {
	const user = audienceMember.user as unknown as OdspUser;
	assert(
		user.name !== undefined || user.email !== undefined || user.oid !== undefined,
		0x836 /* Provided user was not an "OdspUser". */,
	);

	return {
		userId: user.oid,
		name: user.name,
		email: user.email,
		connections: [],
	};
}
