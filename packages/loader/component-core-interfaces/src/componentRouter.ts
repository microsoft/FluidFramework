/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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

export enum RequestUrlEnum {
    DefaultComponent = "/",
}
