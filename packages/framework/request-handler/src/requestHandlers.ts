/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResponse } from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RequestParser } from "@fluidframework/runtime-utils";

/**
 * A request handler for the container runtime. Each handler should handle a specific request, and return undefined
 * if it does not apply. These handlers are called in series, so there may be other handlers before or after.
 * A handler should only return error if the request is for a route the handler owns, and there is a problem with
 * the route, or fulling the specific request.
 * @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
 *
 * @alpha
 */
export type RuntimeRequestHandler = (
	request: RequestParser,
	runtime: IContainerRuntime,
) => Promise<IResponse | undefined>;
