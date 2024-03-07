/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IRequest, type IResponse } from "@fluidframework/core-interfaces";
import { type IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RequestParser, create404Response } from "@fluidframework/runtime-utils";
// eslint-disable-next-line import/no-deprecated
import { type RuntimeRequestHandler } from "./requestHandlers.js";

/**
 * The RuntimeRequestHandlerBuilder creates a runtime request handler based on request handlers.
 * The provided handlers sequentially applied until one is able to satisfy the request.
 */
class RuntimeRequestHandlerBuilder {
	// eslint-disable-next-line import/no-deprecated
	private readonly handlers: RuntimeRequestHandler[] = [];

	// eslint-disable-next-line import/no-deprecated
	public pushHandler(...handlers: RuntimeRequestHandler[]): void {
		if (handlers !== undefined) {
			this.handlers.push(...handlers);
		}
	}

	public async handleRequest(request: IRequest, runtime: IContainerRuntime): Promise<IResponse> {
		const parser = RequestParser.create(request);
		for (const handler of this.handlers) {
			const response = await handler(parser, runtime);
			if (response !== undefined) {
				return response;
			}
		}
		return create404Response(request);
	}
}

/**
 * Deprecated.
 *
 * @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
 *
 * @internal
 */
export function buildRuntimeRequestHandler(
	// eslint-disable-next-line import/no-deprecated
	...handlers: RuntimeRequestHandler[]
): (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse> {
	const builder = new RuntimeRequestHandlerBuilder();
	builder.pushHandler(...handlers);
	return async (request: IRequest, runtime: IContainerRuntime) =>
		builder.handleRequest(request, runtime);
}
