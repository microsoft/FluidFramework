/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResponse, IRequest } from "../fluidRouter";

export const IComponentRouter: keyof IProvideComponentRouter = "IComponentRouter";

/**
 * Request routing
 */
export interface IProvideComponentRouter {
    readonly IComponentRouter: IComponentRouter;
}
export interface IComponentRouter extends IProvideComponentRouter {
    request(request: IRequest): Promise<IResponse>;
}
