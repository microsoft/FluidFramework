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
import { ProseMirrorView } from "./prosemirrorView";
import { IStorageUtil, StorageUtil } from './storage';
import { getNodeFromMarkdown } from './utils';


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


export function debounceUtil(functionToBeExecuted, debounceInterval) {
    let timeoutForDebouncing;

    return function executorFunction(...args) {
        const executeAfterDebounceInterval = () => {
            console.log("Debouncing util has executed");

            timeoutForDebouncing = null;

            functionToBeExecuted(...args);
        };

        /**
         * If another call comes to the
         * function within the same
         * debouncing interval then
         * clear the existing timeout and restart
         * the timeout
         */
        clearTimeout(timeoutForDebouncing);

        timeoutForDebouncing = setTimeout(() => { executeAfterDebounceInterval() }, debounceInterval);
    }
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
    // private readonly debouncingInterval: number = 1000;


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


        this.text = await this.root.get<IFluidHandle<SharedString>>("text").get();

        this.collabManager = new FluidCollabManager(this.text, this.runtime.loader);

        let schema = await this.collabManager.getSchema();
        // this.StorageUtilModule = new StorageUtil(); //TO Be removed
        if (!isWebClient()) {
            this.StorageUtilModule = new StorageUtil();
            let initialVal = await this.StorageUtilModule.getMardownDataAndConvertIntoNode(schema);
            await this.collabManager.initializeValue(initialVal);
        }
        else {
            this.StorageUtilModule = new StorageUtil(true);
        }


        this.hasValueChanged();
    }

    public hasValueChanged() {
        this.collabManager?.on("valueChanged", (changed) => {
            this.emit("valueChanged")
            // Here we can set data to original file
            // this.StorageUtilModule.storeData(this.collabManager.getCurrentState().toJSON());

            if (!isWebClient()) {
                // let debouncedFunction = debounceUtil(() => { this.StorageUtilModule.storeDeltaChangesOfEditor(this.collabManager.getSchema(), this.collabManager.getCurrentState()?.doc) }, this.debouncingInterval);
                // debouncedFunction();

                this.StorageUtilModule.storeEditorStateAsMarkdown(this.collabManager.getSchema(), this.collabManager.getCurrentState()?.doc);
            }
            console.log("something changed ", changed);
        });
    }

    public render(elm: HTMLElement): void {
        if (isWebClient()) {
            if (!this.view) {
                this.view = new ProseMirrorView(this.collabManager);
            }
            this.view.render(elm);
            document.getElementById('input-file').addEventListener('change', e => { this.onFileSelect(e) }, false);

        }
    }

    public getSnapShots(blobUrl) {

        console.log(this.StorageUtilModule);
    }

    public onFileSelect(event) {
        const file = event.target.files[0];
        const reader = new FileReader();
        const _this = this;
        reader.onload = async (e) => {
            const textFile = reader.result as string;
            const node = await getNodeFromMarkdown(_this.collabManager.getSchema(), textFile);
            await _this.collabManager.initializeValue(node);
            console.log(textFile);
        };
        reader.readAsText(file);
    }
}

export const ProseMirrorFactory = new DataObjectFactory(
    ProseMirror.Name,
    ProseMirror,
    [SharedString.getFactory()],
    {},
);

const isWebClient = () => {
    return typeof window !== "undefined" && typeof window.document !== "undefined";
};
