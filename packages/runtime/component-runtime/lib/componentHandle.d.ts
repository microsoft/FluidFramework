/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidObject, IFluidHandle, IFluidHandleContext, IFluidRouter, IRequest, IResponse } from "@fluidframework/component-core-interfaces";
export declare class FluidOjectHandle<T extends IFluidObject = IFluidObject> implements IFluidHandle {
    protected readonly value: T;
    readonly path: string;
    readonly routeContext: IFluidHandleContext;
    private graphAttachState;
    private bound;
    readonly absolutePath: string;
    get IFluidRouter(): IFluidRouter;
    get IFluidHandleContext(): IFluidHandleContext;
    get IFluidHandle(): IFluidHandle;
    get isAttached(): boolean;
    /**
     * Creates a new FluidOjectHandle.
     * @param value - The IFluidObject object this handle is for.
     * @param path - The path to this handle relative to the routeContext.
     * @param routeContext - The parent IFluidHandleContext that has a route to this handle.
     */
    constructor(value: T, path: string, routeContext: IFluidHandleContext);
    get(): Promise<any>;
    attachGraph(): void;
    bind(handle: IFluidHandle): void;
    request(request: IRequest): Promise<IResponse>;
}
//# sourceMappingURL=componentHandle.d.ts.map