/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SummarizableData } from "@microsoft/fluid-summarizable-object";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { IAqueductAnchor } from "./interfaces";
export declare class AqueductAnchor extends PrimedComponent implements IAqueductAnchor {
    static getFactory(): PrimedComponentFactory;
    name: string;
    private static readonly factory;
    private _summarizableObject;
    constructor(runtime: IComponentRuntime, context: IComponentContext);
    get data(): SummarizableData;
    set(data: SummarizableData, sequenceNumber: number): void;
    protected componentInitializingFirstTime(): Promise<void>;
    protected componentHasInitialized(): Promise<void>;
}
//# sourceMappingURL=anchor.d.ts.map