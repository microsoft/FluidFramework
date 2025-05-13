/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IClient } from "@fluidframework/driver-definitions";

import type { OdspMember } from "./interfaces.js";

/**
 * Since ODSP provides user names, email and oids for all of its members, we extend the
 * {@link @fluidframework/fluid-static#IMember} interface to include this service-specific value.
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

/**
 * Creates an audience member from an IClient instance.
 *
 * @param audienceMember - the client instance/
 */
export function createOdspAudienceMember(audienceMember: IClient): OdspMember {
	const user = audienceMember.user as unknown as OdspUser;
	assert(
		user.name !== undefined || user.email !== undefined || user.oid !== undefined,
		0x836 /* Provided user was not an "OdspUser". */,
	);

	return {
		id: user.oid,
		name: user.name,
		email: user.email,
		connections: [],
	};
}
