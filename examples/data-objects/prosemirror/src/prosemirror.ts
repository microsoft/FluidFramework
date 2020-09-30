/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IRequest,
    IResponse,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IMergeTreeInsertMsg,
    ReferenceType,
    reservedRangeLabelsKey,
    MergeTreeDeltaType,
    createMap,
} from "@fluidframework/merge-tree";
import { SharedString } from "@fluidframework/sequence";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { nodeTypeKey } from "./fluidBridge";
import { FluidCollabManager, IProvideRichTextEditor } from "./fluidCollabManager";
import {ProseMirrorView} from "./prosemirrorView";
import { IStorageUtil, StorageUtil } from './storage';


function createTreeMarkerOps(
    treeRangeLabel: string,
    beginMarkerPos: number,
    endMarkerPos: number,
    nodeType: string,
): IMergeTreeInsertMsg[] {
    const endMarkerProps = createMap<any>();
    endMarkerProps[reservedRangeLabelsKey] = [treeRangeLabel];
    endMarkerProps[nodeTypeKey] = nodeType;

    const beginMarkerProps = createMap<any>();
    beginMarkerProps[reservedRangeLabelsKey] = [treeRangeLabel];
    beginMarkerProps[nodeTypeKey] = nodeType;

    return [
        {
            seg: { marker: { refType: ReferenceType.NestBegin }, props: beginMarkerProps },
            pos1: beginMarkerPos,
            type: MergeTreeDeltaType.INSERT,
        },
        {
            seg: { marker: { refType: ReferenceType.NestEnd }, props: endMarkerProps },
            pos1: endMarkerPos,
            type: MergeTreeDeltaType.INSERT,
        },
    ];
}

/**
 * ProseMirror builds a Fluid collaborative text editor on top of the open source text editor ProseMirror.
 */
export class ProseMirror extends DataObject implements IFluidHTMLView, IProvideRichTextEditor {

    public get IFluidHTMLView() { return this; }
    public get IRichTextEditor() { return this.collabManager; }

    public text: SharedString;
    private collabManager: FluidCollabManager;
    private view: ProseMirrorView;
    private StorageUtilModule: IStorageUtil;


    public static get Name() { return "@fluid-example/prosemirror"; }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }

    protected async initializingFirstTime() {
        const text = SharedString.create(this.runtime);

        const ops = createTreeMarkerOps("prosemirror", 0, 1, "paragraph");
        text.groupOperation({ ops, type: MergeTreeDeltaType.GROUP });
        text.insertText(1, "Hello, world!");

        this.root.set("text", text.handle);
    }

    protected async hasInitialized() {
        this.StorageUtilModule = new StorageUtil();

        this.text = await this.root.get<IFluidHandle<SharedString>>("text").get();

        this.collabManager = new FluidCollabManager(this.text, this.runtime.loader, this.StorageUtilModule);
        
        let schema = await this.collabManager.getSchema();

        let initialVal = await this.StorageUtilModule.getMardownDataAndConvertIntoNode(schema);

        await this.collabManager.initializeValue(initialVal);

        this.hasValueChanged();
    }

    public hasValueChanged() {
        this.collabManager?.on("valueChanged", (changed) => {
            // Here we can set data to original file
            console.log("something changed ", changed);
        });
    }

    public render(elm: HTMLElement): void {
        if (isWebClient()) {
            if (!this.view) {
                this.view = new ProseMirrorView(this.collabManager);
            }
            this.view.render(elm);
        }
    }
}

export const ProseMirrorFactory = new DataObjectFactory (
    ProseMirror.Name,
    ProseMirror,
    [SharedString.getFactory()],
    {},
);

const isWebClient = () => {
    return typeof window !== "undefined" && typeof window.document !== "undefined";
}
