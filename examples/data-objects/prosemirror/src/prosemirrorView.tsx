/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
import { EditorView } from "prosemirror-view";
import { FluidCollabManager } from "./fluidCollabManager";

export class ProseMirrorView implements IFluidHTMLView {
    private content: HTMLDivElement;
    private editorView: EditorView;
    private textArea: HTMLDivElement;
    private inputFile: HTMLInputElement;
    public get IFluidHTMLView() { return this; }

    public constructor(private readonly collabManager: FluidCollabManager) { }

    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        // Create base textarea
        if (!this.textArea) {
            this.textArea = document.createElement("div");
            this.textArea.classList.add("editor");
            this.content = document.createElement("div");
            this.content.style.display = "none";
            this.content.innerHTML = "";
            this.inputFile = document.createElement("input");
            this.inputFile.type = "file";
            this.inputFile.style.padding = "10px";
            this.inputFile.id = "input-file";
        }

        // Reparent if needed
        if (this.textArea.parentElement !== elm) {
            this.textArea.remove();
            this.content.remove();
            this.inputFile.remove();
            elm.appendChild(this.textArea);
            elm.appendChild(this.content);
            elm.appendChild(this.inputFile);
        }

        if (!this.editorView) {
            this.editorView = this.collabManager.setupEditor(this.textArea);
        }
    }

    public remove() {
        // Maybe implement this some time.
    }
}
