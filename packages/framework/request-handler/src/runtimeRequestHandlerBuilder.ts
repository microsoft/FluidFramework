/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@fluidframework/core-interfaces";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RequestParser, create404Response } from "@fluidframework/runtime-utils";
// eslint-disable-next-line import/no-deprecated
import { RuntimeRequestHandler } from "./requestHandlers";

/**
 * The RuntimeRequestHandlerBuilder creates a runtime request handler based on request handlers.
 * The provided handlers sequentially applied until one is able to satisfy the request.
 */
class RuntimeRequestHandlerBuilder {
	// eslint-disable-next-line import/no-deprecated
	private readonly handlers: RuntimeRequestHandler[] = [];

	// eslint-disable-next-line import/no-deprecated
	public pushHandler(...handlers: RuntimeRequestHandler[]) {
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
 * @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
 *
 * @internal
 */
// eslint-disable-next-line import/no-deprecated
export function buildRuntimeRequestHandler(...handlers: RuntimeRequestHandler[]) {
	const builder = new RuntimeRequestHandlerBuilder();
	builder.pushHandler(...handlers);
	return async (request: IRequest, runtime: IContainerRuntime) =>
		builder.handleRequest(request, runtime);
}
