/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IChannelAttributes, IComponentRuntime, ISharedObjectServices } from "@microsoft/fluid-runtime-definitions";
import { ISharedObject, ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
/**
 * The factory that defines the summarizable object.
 * @sealed
 */
export declare class SummarizableObjectFactory implements ISharedObjectFactory {
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory."type"}
     */
    static readonly Type = "https://graph.microsoft.com/types/summarizable-object";
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.attributes}
     */
    static readonly Attributes: IChannelAttributes;
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory."type"}
     */
    get type(): string;
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.attributes}
     */
    get attributes(): IChannelAttributes;
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.load}
     */
    load(runtime: IComponentRuntime, id: string, services: ISharedObjectServices, branchId: string, attributes: IChannelAttributes): Promise<ISharedObject>;
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#ISharedObjectFactory.create}
     */
    create(runtime: IComponentRuntime, id: string): ISharedObject;
}
//# sourceMappingURL=summarizableObjectFactory.d.ts.map