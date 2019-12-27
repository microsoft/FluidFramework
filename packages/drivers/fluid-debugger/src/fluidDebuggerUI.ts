/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ISequencedDocumentMessage, IVersion } from "@microsoft/fluid-protocol-definitions";

export interface IDebuggerUI {
    /**
     * Version information is provided.
     * Expect updates (information about seq#, timestamp) through updateVersion() calls
     */
    addVersions(version: IVersion[]): void;

    /**
     * Call when new version is downloaded from storage
     * Expect multiple callbacks.
     */
    updateVersion(index: number, version: IVersion, seqNumber: number): void;

    /**
     * Called in response to successful onVersionSelection() or onSnapshotFileSelection() call
     * and provides extra information about selection.
     * It expected that UI layer would change its mode as result of this call, i.e. switch to
     * displaying op playback controls (if this is supported)
     * Note: There maybe no call to versionSelected() in response to onSnapshotFileSelection() call
     * if file does not exist, has wrong name of wrong format.
     * @param version - version, file name, or undefined if playing ops.
     */
    versionSelected(seqNumber: number, version?: IVersion | string): void;

    /**
     * Called by controller in response to new ops being downloaded
     * Called with disable = true if there are no (currently) ops to play
     */
    disableNextOpButton(disable: boolean): void;

    /**
     * Called by controller when new ops arrive (or we are done playing previous batch)
     * Indicates next batch of ops that would be played when UI calls controller's onOpButtonClick()
     * Called with ops=[] when there are no ops to play.
     */
    updateNextOpText(ops: ISequencedDocumentMessage[]): void;

    /**
     * Called periodically when new versions are downloaded from server
     */
    updateVersionText(versionsLeft: number): void;

    /**
     * Called periodically to notify about last known op
     * @param lastKnownOp - seq number of last known op. -1 if can't play ops in this mode (load from file)
     * @param stillLoading - true if we did not reach yet the end of the stream
     */
    updateLastOpText(lastKnownOp: number, stillLoading: boolean): void;
}

export interface IDebuggerController {
    /**
     * Initialization. UI layers calls into controller to connect the two.
     * @param ui - UI layer
     */
    connectToUi(ui: IDebuggerUI);

    /**
     * Called by UI layer when debugger window is closed by user
     * If called before user makes selection of snapshot/file/no snapshot, original
     * document service is returned to loader (instead of debugger service) and normal document load continues.
     */
    onClose(): void;

    /**
     * UI Layer notifies about selection of version to continue.
     * On successful load, versionSelected() is called.
     * @param version - Version, undefined (playing ops)
     */
    onVersionSelection(version?: IVersion): void;

    /**
     * UI Layer notifies about selection of version to continue.
     * On successful load, versionSelected() is called.
     * @param version - File to load snapshot from
     */
    onSnapshotFileSelection(file: File): void;

    /**
     * "next op" button is clicked in UI
     * @param steps - number of ops to play.
     */
    onOpButtonClick(steps: number): void;
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
    protected versions: IVersion[] = [];

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
            // Accounting for "no snapshots"
            const index = this.selector!.selectedIndex;
            controller.onVersionSelection(index === 0 ? undefined : this.versions[index - 1]);
        };

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        fileSnapshot.addEventListener("change", async () => {
            const files = fileSnapshot.files;
            if (files) {
                controller.onSnapshotFileSelection(files[0]);
            }
        }, false);

        this.versionText.textContent = "Fetching snapshots, please wait...";

        controller.connectToUi(this);
    }

    public addVersions(versions: IVersion[]) {
        if (this.selector) {
            this.versions = versions;
            for (const version of versions) {
                const option = document.createElement("option");
                if (version.date !== undefined) {
                    option.text = `id = ${version.id},  time = ${version.date}`;
                } else {
                    option.text = `id = ${version.id}`;
                }
                this.selector.add(option);
            }
        }
    }

    public updateVersion(index: number, version: IVersion, seqNumber: number) {
        if (this.selector) {
            const option = this.selector[index + 1] as HTMLOptionElement;
            option.text = `${option.text},  seq = ${seqNumber}`;
            // Accounting for "no snapshots"
            this.selector[index + 1] = option;
        }
    }

    public versionSelected(seqNumber: number, version?: IVersion | string) {
        let text: string;
        if (version === undefined) {
            text = "Playing from seq# 0";
        } else if (typeof version === "string") {
            text = `Playing ${version} file`;
        } else {
            text = `Playing from ${version.id}, seq# ${seqNumber}`;
        }

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

        this.versionText.textContent = text;
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

    public updateVersionText(versionCount: number) {
        if (!this.wasVersionSelected) {
            const text = versionCount === 0 ? "" : `Fetching information about ${versionCount} snapshots...`;
            this.versionText.textContent = text;
        }
    }

    public updateLastOpText(lastKnownOp: number, stillLoading: boolean) {
        let text: string;
        if (lastKnownOp < 0) {
            text = `FluidDebugger can't play ops in this mode`;
        }
        if (stillLoading) {
            text = `Last op (still loading): ${lastKnownOp}`;
        } else {
            text = `Document's last op seq#: ${lastKnownOp}`;
        }
        this.lastOpText!.textContent = text;
    }
}
