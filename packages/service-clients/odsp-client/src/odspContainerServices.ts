/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import { createServiceAudience } from "@fluidframework/fluid-static/internal";

import type {
	IOdspAudience,
	OdspContainerServices as IOdspContainerServices,
} from "./interfaces.js";
import { createOdspAudienceMember } from "./odspAudience.js";

/**
 * @internal
 */
export class OdspContainerServices implements IOdspContainerServices {
	public readonly audience: IOdspAudience;

	public constructor(container: IContainer) {
		this.audience = createServiceAudience({
			container,
			createServiceMember: createOdspAudienceMember,
		});
	}
}
