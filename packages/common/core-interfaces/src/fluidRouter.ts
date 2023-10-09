/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IRequestHeader {
	// TODO: Use `unknown` instead (API-Breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[index: string]: any;
}

export interface IRequest {
	url: string;
	headers?: IRequestHeader;
}

export interface IResponse {
	mimeType: string;
	status: number;
	// TODO: Use `unknown` instead (API-Breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any;
	// TODO: Use `unknown` instead (API-Breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	headers?: { [key: string]: any };
	stack?: string;
}

/**
 * @deprecated Will be removed in future major release. Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
 */
export const IFluidRouter: keyof IProvideFluidRouter = "IFluidRouter";

/**
 * Request routing
 * @deprecated Will be removed in future major release. Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
 */
export interface IProvideFluidRouter {
	readonly IFluidRouter: IFluidRouter;
}

/**
 * @deprecated Will be removed in future major release. Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
 */
export interface IFluidRouter extends IProvideFluidRouter {
	request(request: IRequest): Promise<IResponse>;
}
