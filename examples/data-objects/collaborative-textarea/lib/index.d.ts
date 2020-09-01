/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
/**
 * CollaborativeText uses the React CollaborativeTextArea to load a collaborative HTML <textarea>
 */
export declare class CollaborativeText extends DataObject implements IFluidHTMLView {
    private readonly textKey;
    private text;
    get IFluidHTMLView(): this;
    static get ComponentName(): string;
    private static readonly factory;
    static getFactory(): DataObjectFactory<object, undefined>;
    protected initializingFirstTime(): Promise<void>;
    protected hasInitialized(): Promise<void>;
    /**
     * Renders a new view into the provided div
     */
    render(div: HTMLElement): HTMLElement;
}
export declare const fluidExport: DataObjectFactory<object, undefined>;
//# sourceMappingURL=index.d.ts.map