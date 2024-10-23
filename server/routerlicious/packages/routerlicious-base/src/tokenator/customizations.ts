/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAccessTokenGenerator, IReadinessCheck } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export interface ITokenatorResourcesCustomizations {
	accessTokenGenerator?: IAccessTokenGenerator;
	readinessCheck?: IReadinessCheck;
}
