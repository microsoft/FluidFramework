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
    headers?: {
        [key: string]: any;
    };
}
export declare const IFluidRouter: keyof IProvideFluidRouter;
/**
 * Request routing
 */
export interface IProvideFluidRouter {
    readonly IFluidRouter: IFluidRouter;
}
export interface IFluidRouter extends IProvideFluidRouter {
    request(request: IRequest): Promise<IResponse>;
}
//# sourceMappingURL=fluidRouter.d.ts.map