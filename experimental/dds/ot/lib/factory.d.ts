/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IChannelAttributes, IFluidDataStoreRuntime, IChannelServices, IChannelFactory } from "@fluidframework/datastore-definitions";
import { ISharedOT } from "./interfaces";
/**
 * The factory that defines the map
 */
export declare class OTFactory implements IChannelFactory {
    static readonly Type = "https://graph.microsoft.com/types/OT";
    static readonly Attributes: IChannelAttributes;
    get type(): string;
    get attributes(): IChannelAttributes;
    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    load(runtime: IFluidDataStoreRuntime, id: string, services: IChannelServices, attributes: IChannelAttributes): Promise<ISharedOT>;
    create(document: IFluidDataStoreRuntime, id: string): ISharedOT;
}
//# sourceMappingURL=factory.d.ts.map