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
import { convertToMarkdown, getNodeFromMarkdown } from './utils';
import { BlobItem } from "@azure/storage-blob";
import { ISyncMessageHandler, TestComponent, SyncBridge, SyncMessage, SyncMessageHandlerResult, SyncMessageType } from "syncbridge"
import { AzureBlobConnector } from "./connector/AzureConnector";


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
export class ProseMirror extends DataObject implements IFluidHTMLView, IProvideRichTextEditor, ISyncMessageHandler {

    public get IFluidHTMLView() { return this; }
    public get IRichTextEditor() { return this.collabManager; }

    public text: SharedString;
    public collabManager: FluidCollabManager;
    private view: ProseMirrorView;
    public StorageUtilModule: IStorageUtil;
    public snapshotList: BlobItem[] = [];
    private readonly sbClientKey: string = 'sbClientKey';
    private syncBridge!: SyncBridge;
  
    // private readonly debouncingInterval: number = 1000;


    public static get Name() { return "@fluid-example/prosemirror"; }

    public async request(request: IRequest): Promise<IResponse> {
        return {
            mimeType: "fluid/object",
            status: 200,
            value: this,
        };
    }
    public get ISyncMessageHandler() {
        return this;
      }

    public handleSyncMessage = async (syncMessage: SyncMessage): Promise<SyncMessageHandlerResult | undefined> => {
          return {success:true}
      }


    protected async initializingFirstTime() {
        const text = SharedString.create(this.runtime);
        console.log("initializing first tie prosemirror blb")
        // const testComponent = await TestComponent.getFactory().createChildInstance(
        //     this.context
        // );
        const ops = createTreeMarkerOps("prosemirror", 0, 1, "paragraph");
        text.groupOperation({ ops, type: MergeTreeDeltaType.GROUP });
        text.insertText(1, "Hello, world!");

        this.root.set("text", text.handle);
       // this.root.set("testcompo", testComponent.IFluidHandle)

        const azureConnector = await AzureBlobConnector.getFactory().createChildInstance(this.context)
        const f:any | undefined =  { connectorHandle: azureConnector.handle }
        const syncBridge = await SyncBridge.getFactory().createChildInstance(this.context, f);
        this.root.set(this.sbClientKey, syncBridge.handle);

    }

    protected async hasInitialized() {
        console.log("initialized prosemirror blob");


        this.text = await this.root.get<IFluidHandle<SharedString>>("text").get();
        // console.log(await this.root.get("testcompo").get());
        this.collabManager = new FluidCollabManager(this.text, this.runtime.loader);
        this.syncBridge = await this.root.get(this.sbClientKey).get();''
        let schema = await this.collabManager.getSchema();
        const client = await this.syncBridge?.ISyncBridgeClientProvider.getSyncBridgeClient();
        await client.registerSyncMessageHandler(this);
        // this.StorageUtilModule = new StorageUtil(); //TO Be removed
        if (!isWebClient()) {
            this.StorageUtilModule = new StorageUtil(this.context.documentId);
            let initialVal = await this.StorageUtilModule.getMardownDataAndConvertIntoNode(schema);
            if (initialVal) {
                await this.collabManager.initializeValue(initialVal)
            };
        }
        // else {
        //     this.StorageUtilModule = new StorageUtil(this.context.documentId, true);
        // }
       //  this.snapshotList = await this.StorageUtilModule.getSnapShotlist();

        this.hasValueChanged();
        this.hasSnapshotChanged();
    }

    public hasSnapshotChanged() {
        this.on("snapshotTaken", (snapshotList) => {
            this.snapshotList = snapshotList;
            this.emit("snapshotAdded", this.snapshotList);
        })
    }

    public hasValueChanged() {
        this.collabManager?.on("valueChanged", (changed) => {
            this.emit("valueChanged")
            // Here we can set data to original file
            // this.StorageUtilModule.storeData(this.collabManager.getCurrentState().toJSON());

            if (!isWebClient()) {
                // let debouncedFunction = debounceUtil(() => { this.StorageUtilModule.storeDeltaChangesOfEditor(this.collabManager.getSchema(), this.collabManager.getCurrentState()?.doc) }, this.debouncingInterval);
                // debouncedFunction();
                this.submitUpdateStore();
              // this.StorageUtilModule.storeEditorStateAsMarkdown(this.collabManager.getSchema(), this.collabManager.getCurrentState()?.doc);
            }
            console.log("something changed ", changed);
        });
    }

    public render(elm: HTMLElement): void {
        if (isWebClient()) {
            if (!this.view) {
                this.view = new ProseMirrorView(this);
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

    public async submitUpdateStore(){
        const client = await this.syncBridge?.ISyncBridgeClientProvider.getSyncBridgeClient();
        const data = this.collabManager.getCurrentState()?.doc
        let _t = await convertToMarkdown(data);
        console.log("_____________t______",_t);
        const UPDATE_STORE_DATA = {
          opCode: 'UPDATE_STORE_DATA',
          type: SyncMessageType.SyncOperation,
          payload: {data:_t }
        } as SyncMessage;
        client.submit(UPDATE_STORE_DATA);
    }
}



export const ProseMirrorFactory = new DataObjectFactory(
    ProseMirror.Name,
    ProseMirror,
    [SharedString.getFactory()],
    {},
    [
        [SyncBridge.name, import("syncbridge").then((m) => m.SyncBridge.getFactory())],
        [TestComponent.name, import("syncbridge").then((m) => m.TestComponent.getFactory())],
        [AzureBlobConnector.name, import("./connector/AzureConnector").then((m) => m.AzureBlobConnector.getFactory())]
    ]
);

const isWebClient = () => {
    return typeof window !== "undefined" && typeof window.document !== "undefined";
};
