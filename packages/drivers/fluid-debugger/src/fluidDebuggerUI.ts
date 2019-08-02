/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@prague/protocol-definitions";
import * as assert from "assert";

export interface IDebuggerUI {
    addVersion(version: string): void;
    versionSelected(VersionInfo): void;
    disableNextOpButton(disable: boolean): void;
    updateNextOpText(ops: ISequencedDocumentMessage[]): void;
    updateVersionText(text: string): void;
    updateLastOpText(text: string): void;
}

export interface IDebuggerController {
    connectToUi(ui: IDebuggerUI);
    onClose(): void;
    onVersionSelection(index: number): void;
    onOpButtonClick(steps: number): void;
    onSnapshotFileSelection(file: File): void;
}

const debuggerWindowHtml =
`<Title>Fluid Debugger</Title>
<body>
<h3>Fluid Debugger</h3>
Please select snapshot or file to start with<br/>
Close debugger window to proceed to live document<br/><br/>
<select style='width:250px' id='selector'>
<option>No snapshot</option>
</select>
&nbsp; &nbsp; &nbsp;
<button id='buttonVers' style='width:60px'>Go</button><br/>
<input id='file' type='file'/>
<br/><br/><div id='versionText'></div><br/>
</body>`;

const debuggerWindowHtml2 =
`<Title>Fluid Debugger</Title>
<body>
<h3>Fluid Debugger</h3>
<div id='versionText'></div>
<div id='lastOp'></div>
<br/>
Step to move: <input type='number' id='steps' value='1' style='width:50px'/>
&nbsp; &nbsp; &nbsp;<button id='buttonOps' style='width:60px'>Go</button>
<br/><br/>
<div id='text1'></div><div id='text2'></div><div id='text3'></div>
</body>`;

// tslint:disable:no-non-null-assertion

export class DebuggerUI {
    public static create(controller: IDebuggerController): DebuggerUI | null {
        if (
                typeof window !== "object" ||
                window === null ||
                typeof window.document !== "object" ||
                window.document == null) {
            console.log("Can't create debugger window - not running in browser!");
            return null;
        }

        const debuggerWindow = window.open(
            "",
            "",
            "width=400,height=400,resizable=yes,location=no,menubar=no,titlebar=no,status=no,toolbar=no");
        if (!debuggerWindow) {
            console.error("Can't create debugger window - please enable pop-up windows in your browser!");
            return null;
        }

        return new DebuggerUI(controller, debuggerWindow);
    }

    private static formatDate(date: number) {
        // Alternative - without timezone
        // new Date().toLocaleString('default', { timeZone: 'UTC'}));
        // new Date().toLocaleString('default', { year: 'numeric', month: 'short',
        //      day: 'numeric', hour: '2-digit', minute: 'numeric', second: 'numeric' }));
        return new Date(date).toUTCString();
    }

    protected selector?: HTMLSelectElement;
    protected versionText: HTMLDivElement;

    protected buttonOps?: HTMLButtonElement;
    protected text1?: HTMLDivElement;
    protected text2?: HTMLDivElement;
    protected text3?: HTMLDivElement;
    protected lastOpText?: HTMLDivElement;
    protected wasVersionSelected = false;

    protected documentClosed = false;

    protected constructor(private readonly controller: IDebuggerController, private readonly debuggerWindow: Window) {
        const doc = this.debuggerWindow.document;
        doc.write(debuggerWindowHtml);

        window.addEventListener("beforeunload", (e) => {
            this.documentClosed = true;
            this.debuggerWindow.close();
        }, false);

        this.debuggerWindow.addEventListener("beforeunload", (e) => {
            if (!this.documentClosed) {
                this.controller.onClose();
            }
        }, false);

        this.selector = doc.getElementById("selector") as HTMLSelectElement;
        const buttonVers = doc.getElementById("buttonVers") as HTMLDivElement;
        const fileSnapshot = doc.getElementById("file") as HTMLInputElement;
        this.versionText = doc.getElementById("versionText") as HTMLDivElement;

        buttonVers.onclick = () => {
            controller.onVersionSelection(this.selector!.selectedIndex);
        };

        fileSnapshot.addEventListener("change", async () => {
            const files = fileSnapshot.files;
            if (files) {
                controller.onSnapshotFileSelection(files[0]);
            }
        }, false);

        controller.connectToUi(this);
    }

    public addVersion(version: string) {
        if (this.selector) {
            const option = document.createElement("option");
            option.text = version;
            this.selector.add(option);
        }
    }

    public versionSelected(VersionInfo: string) {
        this.wasVersionSelected = true;
        this.selector = undefined;

        const doc = this.debuggerWindow.document;
        doc.open();
        doc.write(debuggerWindowHtml2);
        doc.close();

        this.versionText = doc.getElementById("versionText") as HTMLDivElement;
        this.lastOpText = doc.getElementById("lastOp") as HTMLDivElement;
        const steps = doc.getElementById("steps") as HTMLInputElement;
        this.text1 = doc.getElementById("text1") as HTMLDivElement;
        this.text2 = doc.getElementById("text2") as HTMLDivElement;
        this.text3 = doc.getElementById("text3") as HTMLDivElement;

        this.buttonOps = doc.getElementById("buttonOps") as HTMLButtonElement;
        this.buttonOps.disabled = true;
        this.buttonOps.onclick = () => {
            this.controller.onOpButtonClick(Number(steps.value));
        };

        this.versionText.textContent = VersionInfo;
    }

    public disableNextOpButton(disable: boolean) {
        assert(this.buttonOps);
        this.buttonOps!.disabled = disable;
    }

    public updateNextOpText(ops: ISequencedDocumentMessage[]) {
        if (ops.length === 0) {
            this.text1!.textContent = "";
            this.text2!.textContent = "";
            this.text3!.textContent = "";
        } else {
            const op = ops[0];
            const seq = op.sequenceNumber;
            const date = DebuggerUI.formatDate(op.timestamp);
            this.text1!.textContent = `Next op seq#: ${seq}`;
            this.text2!.textContent = `Type: ${op.type}`;
            this.text3!.textContent = `${date}`;
        }
    }

    public updateVersionText(text: string) {
        if (!this.wasVersionSelected) {
            this.versionText.textContent = text;
        }
    }

    public updateLastOpText(text: string) {
        this.lastOpText!.textContent = text;
    }
}
