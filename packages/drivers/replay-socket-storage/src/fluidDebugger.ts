/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentAttributes,
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISnapshotTree,
    IVersion,
} from "@prague/container-definitions";
import { Deferred, readAndParse } from "@prague/utils";
import * as assert from "assert";
import { IReplayController } from "./replayController";
import { MaxBatchDeltas } from "./replayDocumentDeltaConnection";

const debuggerWindowHtml =
"<Title>Fluid Debugger</Title>\
<body>\
<h3>Fluid Debugger</h3>\
<select style='width:250px' id='selector'>\
<option>No snapshot</option>\
</select>\
&nbsp; &nbsp; &nbsp;\
<button id='buttonVers' style='width:60px'>Go</button>\
<br/><br/>\
Step to move: <input type='number' id='steps' value='1' style='width:50px'/>\
&nbsp; &nbsp; &nbsp;\
<button id='buttonOps' style='width:60px'>Go</button><br/>\
<p id='text1'/><p id='text2'/><p id='text3'/>\
<br/><p id='lastOp'/>\
</body>";

/**
 * Replay controller that uses pop-up window to control op playback
 */
export class DebugReplayController implements IReplayController {
    public static create(): DebugReplayController | undefined {
        if (
                typeof window !== "object" ||
                window === null ||
                typeof window.document !== "object" ||
                window.document == null ||
                typeof localStorage !== "object" ||
                localStorage === null) {
            console.error("Can't create debugger window - not running in browser!");
            return;
        }

        if (localStorage.FluidDebugger) {
            const win = window.open(
                "",
                "",
                "width=400,height=400,resizable=yes,location=no,menubar=no,titlebar=no,status=no,toolbar=no");
            if (win) {
                return new DebugReplayController(win);
            }
            console.error("Can't create debugger window - please enable pop-up windows in your browser!");
        }
        return;
    }

    protected static async seqFromTree(
        documentStorageService: IDocumentStorageService,
        tree: ISnapshotTree | null): Promise<number> {
        if (!tree) {
            return 0;
        }

        const attributesHash = ".protocol" in tree.trees ?
            tree.trees[".protocol"].blobs.attributes
            : tree.blobs[".attributes"];
        const attrib = await readAndParse<IDocumentAttributes>(documentStorageService, attributesHash);
        return attrib.sequenceNumber;
    }

    private static FormatDate(date: number) {
        // Alternative - without timezone
        // new Date().toLocaleString('default', { timeZone: 'UTC'}));
        // new Date().toLocaleString('default', { year: 'numeric', month: 'short',
        //      day: 'numeric', hour: '2-digit', minute: 'numeric', second: 'numeric' }));
        return new Date(date).toUTCString();
    }

    protected readonly selector: HTMLSelectElement;
    protected readonly buttonVers: HTMLButtonElement;
    protected readonly buttonOps: HTMLButtonElement;
    protected readonly steps: HTMLInputElement;
    protected readonly text1: HTMLParagraphElement;
    protected readonly text2: HTMLParagraphElement;
    protected readonly text3: HTMLParagraphElement;
    protected readonly lastOpText: HTMLParagraphElement;

    protected stepsDeferred?: Deferred<number>;
    protected startSeqDeferred = new Deferred<number>();
    protected documentStorageService?: IDocumentStorageService;
    protected versions: IVersion[] = [];
    protected tree: ISnapshotTree | null = null;
    protected stepsToPlay: number = 0;
    protected lastOpReached = false;

    public constructor(protected readonly debuggerWindow: Window) {
        const doc = this.debuggerWindow.document;
        doc.write(debuggerWindowHtml);

        window.addEventListener("beforeunload", (e) => this.debuggerWindow.close(), false);

        this.buttonVers = doc.getElementById("buttonVers") as HTMLButtonElement;
        this.buttonOps = doc.getElementById("buttonOps") as HTMLButtonElement;
        this.selector = doc.getElementById("selector") as HTMLSelectElement;
        this.steps = doc.getElementById("steps") as HTMLInputElement;
        this.text1 = doc.getElementById("text1") as HTMLParagraphElement;
        this.text2 = doc.getElementById("text2") as HTMLParagraphElement;
        this.text3 = doc.getElementById("text3") as HTMLParagraphElement;
        this.lastOpText = doc.getElementById("lastOp") as HTMLParagraphElement;

        this.buttonVers.onclick = async () => {
            this.buttonVers.disabled = true;
            this.selector.disabled = true;

            let index = this.selector.selectedIndex;
            if (index === 0 || !this.documentStorageService) {
                // no snapshot
                this.startSeqDeferred.resolve(0);
                return;
            }
            index--;
            if (index < 0 || index >= this.versions.length) {
                index = 0;
            }

            this.tree = await this.documentStorageService.getSnapshotTree(this.versions[index]);
            const seq = await DebugReplayController.seqFromTree(this.documentStorageService, this.tree);
            this.startSeqDeferred.resolve(seq);
        };

        this.buttonOps.disabled = true;
        this.buttonOps.onclick = () => {
            const result = Number(this.steps.value);
            if (this.stepsDeferred && !Number.isNaN(result) && result > 0) {
                this.stepsDeferred.resolve(result);
            }
        };
    }

    public fetchTo(currentOp: number): number {
        return currentOp + MaxBatchDeltas;
    }

    public async getVersions(
            documentStorageService: IDocumentStorageService,
            versionId: string,
            count: number): Promise<IVersion[]> {
        // Redirect only first call to "our" version/snapshot
        // Better check would be to check versionID === documentID
        if (this.tree === null) {
            return [{id: "latest", treeId: ""}];
        }
        return documentStorageService.getVersions(versionId, count);
    }

    public async getSnapshotTree(documentStorageService: IDocumentStorageService, versionRequested?: IVersion) {
        if (versionRequested && versionRequested.id !== "latest") {
            return documentStorageService.getSnapshotTree(versionRequested);
        }

        if (!this.documentStorageService) {
            this.documentStorageService = documentStorageService;

            this.versions = await documentStorageService.getVersions("", 50);
            if (this.versions.length === 0) {
                this.buttonVers.disabled = true;
                this.selector.disabled = true;
                this.startSeqDeferred.resolve(0);
                return null;
            }

            this.versions.map(async (version) => {
                const treeV = await documentStorageService.getSnapshotTree(version);
                const seqV = await DebugReplayController.seqFromTree(documentStorageService, treeV);

                const option = document.createElement("option");
                option.text = `id = ${version.id}   seq = ${seqV}`;
                this.selector.add(option);
            });
        }
        assert(documentStorageService === this.documentStorageService);

        await this.startSeqDeferred.promise;
        return this.tree;
    }

    public getStartingOpSequence() {
        return this.startSeqDeferred.promise;
    }

    /**
     * Return true if we are done processing ops
     * Returning false as we want to continue to ping server for any new ops.
     */
    public isDoneFetch(currentOp: number, lastTimeStamp?: number): boolean {
        this.lastOpReached = true;
        this.lastOpText.textContent = `Last op: ${currentOp}`;
        return false;
    }

    public async replay(
            emitter: (op: ISequencedDocumentMessage) => void,
            fetchedOps: ISequencedDocumentMessage[]): Promise<void> {

        if (!this.lastOpReached) {
            const op = fetchedOps[fetchedOps.length - 1];
            const lastSeq = op.sequenceNumber;
            this.lastOpText.textContent = `Last op: ${lastSeq}`;
        }
        while (true) {
            if (fetchedOps.length === 0) {
                this.text1.textContent = "";
                this.text2.textContent = "";
                this.text3.textContent = "";
                return;
            }

            if (this.stepsToPlay === 0) {
                this.buttonOps.disabled = false;
                this.stepsDeferred = new Deferred<number>();

                const op = fetchedOps[0];
                const seq = op.sequenceNumber;
                const date = DebugReplayController.FormatDate(op.timestamp);
                this.text1.textContent = `Next op: ${seq}`;
                this.text2.textContent = `Type: ${op.type}`;
                this.text3.textContent = `${date}`;

                this.stepsToPlay = await this.stepsDeferred.promise;

                this.stepsDeferred = undefined;
                this.buttonOps.disabled = true;
            }

            let playOps: ISequencedDocumentMessage[];
            if (this.stepsToPlay >= fetchedOps.length) {
                playOps = fetchedOps;
                // tslint:disable-next-line:no-parameter-reassignment
                fetchedOps = [];
                this.stepsToPlay -= fetchedOps.length;
            } else {
                playOps = fetchedOps.splice(0, this.stepsToPlay);
                this.stepsToPlay = 0;
            }
            playOps.map(emitter);
        }
    }
}
