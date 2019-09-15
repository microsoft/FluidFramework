/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IRequest {
    url: string;
    headers?: { [key: string]: any };
}

export interface IResponse {
    mimeType: string;
    status: number;
    value: any;
    headers?: { [key: string]: any };
}

/**
 * Request routing
 */
export interface IProvideComponentRouter {
    readonly IComponentRouter: IComponentRouter;
}
export interface IComponentRouter extends IProvideComponentRouter {
    request(request: IRequest): Promise<IResponse>;
}
