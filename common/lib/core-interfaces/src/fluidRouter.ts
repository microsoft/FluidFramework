/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IRequestHeader {
    [index: string]: any;
}

export interface IRequest {
    url: string;
    headers?: IRequestHeader;
}

export interface IResponse {
    mimeType: string;
    status: number;
    value: any;
    headers?: { [key: string]: any; };
    stack?: string;
}

export const IFluidRouter: keyof IProvideFluidRouter = "IFluidRouter";

/**
 * Request routing
 */
export interface IProvideFluidRouter {
    readonly IFluidRouter: IFluidRouter;
}
export interface IFluidRouter extends IProvideFluidRouter {
    request(request: IRequest): Promise<IResponse>;
}
