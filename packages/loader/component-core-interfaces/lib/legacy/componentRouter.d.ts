/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IResponse, IRequest } from "../fluidRouter";
export declare const IComponentRouter: keyof IProvideComponentRouter;
/**
 * Request routing
 */
export interface IProvideComponentRouter {
    readonly IComponentRouter: IComponentRouter;
}
export interface IComponentRouter extends IProvideComponentRouter {
    request(request: IRequest): Promise<IResponse>;
}
//# sourceMappingURL=componentRouter.d.ts.map