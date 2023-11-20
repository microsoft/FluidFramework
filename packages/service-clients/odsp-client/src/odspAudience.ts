/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import { ServiceAudience } from "@fluidframework/fluid-static";
import { type IClient } from "@fluidframework/protocol-definitions";

import { type OdspMember, type IOdspAudience, OdspUser } from "./interfaces";

/**
 * ODSP-specific {@link @fluidframework/fluid-static#ServiceAudience} implementation.
 * @alpha
 */
export class OdspAudience extends ServiceAudience<OdspMember> implements IOdspAudience {
	protected createServiceMember(audienceMember: IClient): OdspMember {
		const user = audienceMember.user as OdspUser;
		assert(
			user.name !== undefined || user.email !== undefined,
			0x836 /* Provided user was not an "OdspUser". */,
		);

		return {
			userId: user.id,
			name: user.name,
			email: user.email,
			connections: [],
		};
	}
}
