/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
import { EditorView } from "prosemirror-view";
import { ProseMirror } from "./prosemirror";
import { getNodeFromMarkdown } from './utils';
import { BlobItem } from "@azure/storage-blob";

export class ProseMirrorView implements IFluidHTMLView {
    private content: HTMLDivElement;
    private editorView: EditorView;
    private textArea: HTMLDivElement;
    private inputFile: HTMLInputElement;
    private snapshots: HTMLDivElement;
    public get IFluidHTMLView() { return this; }

    public constructor(private readonly prosemirror: ProseMirror) {
        this.prosemirror.on("snapshotAdded", (snapshotList) => { this.updateSnapshots(snapshotList) });
    }

    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        // Create base textarea
        if (!this.textArea) {
            this.textArea = document.createElement("div");
            this.textArea.classList.add("editor");
            this.content = document.createElement("div");
            this.content.innerHTML = "";
            this.inputFile = document.createElement("input");
            this.inputFile.type = "file";
            this.inputFile.style.padding = "10px";
            this.inputFile.id = "input-file";
            this.snapshots = document.createElement("div");
        }
        if (this.prosemirror.snapshotList.length > 0) {
            this.content.innerHTML = `<p>Snapshots</p>`;
            this.updateSnapshots(this.prosemirror.snapshotList);
        }

        // Reparent if needed
        if (this.textArea.parentElement !== elm) {
            this.textArea.remove();
            this.content.remove();
            this.inputFile.remove();
            elm.appendChild(this.inputFile);
            elm.appendChild(this.textArea);
            elm.appendChild(this.content);
            elm.appendChild(this.snapshots);
        }

        if (!this.editorView) {
            this.editorView = this.prosemirror.collabManager.setupEditor(this.textArea);
        }
    }

    public updateSnapshots(snapshotList: BlobItem[]) {
        this.content.innerHTML = `<p>Snapshots</p>`;
        this.snapshots.innerHTML = "";
        for (let idx = 0; idx < snapshotList.length; idx++) {
            const blobItem = snapshotList[idx];
            let snapshotButton = document.createElement("button");
            snapshotButton.innerText = blobItem.snapshot;
            snapshotButton.style.margin = "5px";
            snapshotButton.onclick = async () => {
                const snapshot = await this.prosemirror.StorageUtilModule.getSnapShotContent(blobItem.snapshot);
                const node = await getNodeFromMarkdown(this.prosemirror.collabManager.getSchema(), snapshot);
                await this.prosemirror.collabManager.initializeValue(node);
            };
            this.snapshots.appendChild(snapshotButton);
        }
    }

    public remove() {
        this.prosemirror.off("snapshotAdded", (snapshotList) => { this.updateSnapshots(snapshotList) });
    }
}
