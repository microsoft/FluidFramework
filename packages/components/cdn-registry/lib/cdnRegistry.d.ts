/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 */
import { IComponentRouter, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, IFluidPackage } from "@microsoft/fluid-container-definitions";
import { ComponentFactoryTypes, IComponentRegistry } from "@microsoft/fluid-runtime-definitions";
export declare class CdnRegistry implements IComponentRegistry, IComponentRouter {
    private readonly containerContext;
    readonly cdnUrlBase: string;
    static readonly defaultComponent: string;
    readonly IComponentRegistry: this;
    readonly IComponentRouter: this;
    private readonly packages;
    private readonly modules;
    constructor(containerContext: IContainerContext, cdnUrlBase: string);
    get(name: string): Promise<ComponentFactoryTypes | undefined>;
    request(request: IRequest): Promise<IResponse>;
    protected getFluidPackage(pkgName: string): Promise<IFluidPackage | undefined>;
    private getDefaultFactory;
    private getModuleFromCache;
    private getPackageFromCache;
}
//# sourceMappingURL=cdnRegistry.d.ts.map