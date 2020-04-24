/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISequencedDocumentMessage, ITree } from "@microsoft/fluid-protocol-definitions";
import { IChannelAttributes, IComponentRuntime, IObjectStorageService, Jsonable } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory, SharedObject } from "@microsoft/fluid-shared-object-base";
import { ISummarizableObject } from "./interfaces";
/**
 * Implementation of a summarizable object. It does not generate any ops. It is only part of the summary.
 * Data should be set in this object in response to a remote op.
 */
export declare class SummarizableObject extends SharedObject implements ISummarizableObject {
    /**
     * Create a new summarizable object
     *
     * @param runtime - component runtime the new summarizable object belongs to.
     * @param id - optional name of the summarizable object.
     * @returns newly create summarizable object (but not attached yet).
     */
    static create(runtime: IComponentRuntime, id?: string): SummarizableObject;
    /**
     * Get a factory for SummarizableObject to register with the component.
     *
     * @returns a factory that creates and loads SummarizableObject.
     */
    static getFactory(): ISharedObjectFactory;
    /**
     * The data held by this object.
     */
    private readonly data;
    /**
     * Constructs a new SummarizableObject. If the object is non-local, an id and service interfaces will
     * be provided.
     *
     * @param id - optional name of the summarizable object.
     * @param runtime - component runtime thee object belongs to.
     * @param attributes - The attributes for the object.
     */
    constructor(id: string, runtime: IComponentRuntime, attributes: IChannelAttributes);
    /**
     * {@inheritDoc ISummarizableObject.get}
     */
    get(key: string): Jsonable;
    /**
     * {@inheritDoc ISummarizableObject.set}
     */
    set(key: string, value: Jsonable): void;
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.snapshot}
     */
    snapshot(): ITree;
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.loadCore}
     */
    protected loadCore(branchId: string, storage: IObjectStorageService): Promise<void>;
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onConnect}
     */
    protected onConnect(pending: any[]): void;
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.registerCore}
     */
    protected registerCore(): void;
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onDisconnect}
     */
    protected onDisconnect(): void;
    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.processCore}
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean): void;
}
//# sourceMappingURL=summarizableObject.d.ts.map