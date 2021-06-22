/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidModule } from "@fluidframework/container-definitions";
import { IUser } from "@fluidframework/protocol-definitions";
import { IFluidPackage } from "@fluidframework/core-interfaces";
export interface IDevServerUser extends IUser {
    name: string;
}
export interface IBaseRouteOptions {
    port: number;
    npm?: string;
}
export interface ILocalRouteOptions extends IBaseRouteOptions {
    mode: "local";
    single?: boolean;
}
export interface IDockerRouteOptions extends IBaseRouteOptions {
    mode: "docker";
    tenantId?: string;
    tenantSecret?: string;
    bearerSecret?: string;
}
export interface IRouterliciousRouteOptions extends IBaseRouteOptions {
    mode: "r11s";
    fluidHost?: string;
    tenantId?: string;
    tenantSecret?: string;
    bearerSecret?: string;
}
export interface ITinyliciousRouteOptions extends IBaseRouteOptions {
    mode: "tinylicious";
    bearerSecret?: string;
    tinyliciousPort?: number;
}
export interface IOdspRouteOptions extends IBaseRouteOptions {
    mode: "spo" | "spo-df";
    server?: string;
    odspAccessToken?: string;
    pushAccessToken?: string;
    forceReauth?: boolean;
    driveId?: string;
}
export declare type RouteOptions = ILocalRouteOptions | IDockerRouteOptions | IRouterliciousRouteOptions | ITinyliciousRouteOptions | IOdspRouteOptions;
export declare function isSynchronized(): boolean;
export declare function start(id: string, packageJson: IFluidPackage, fluidModule: IFluidModule, options: RouteOptions, div: HTMLDivElement): Promise<void>;
//# sourceMappingURL=loader.d.ts.map