/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getGlobalAbortControllerContext } from "@fluidframework/server-services-client";
import type { RequestHandler } from "express";

/**
 * Express.js Middleware that binds AbortControllerContext to the request for its lifetime.
 * Within the request flow, `getGlobalAbortControllerContext().getAbortController()` can then be called
 * to get the abort controller for the request.
 * @internal
 */
export const bindAbortControllerContext = (): RequestHandler => {
	return (req, res, next) => {
		const abortControllerContext = getGlobalAbortControllerContext();
		const abortControllerForRequest = new AbortController();
		abortControllerContext.bindAbortController(abortControllerForRequest, () => next());
	};
};
