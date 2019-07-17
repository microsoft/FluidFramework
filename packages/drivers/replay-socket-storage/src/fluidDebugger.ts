/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentAttributes,
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    IVersion,
} from "@prague/container-definitions";
import { buildHierarchy, Deferred, flatten, readAndParse } from "@prague/utils";
import * as assert from "assert";
import { ReplayController, ReplayStorageService } from "./replayController";
import { MaxBatchDeltas } from "./replayDocumentDeltaConnection";

/**
 * Structure of snapshot on disk, when we store snapshot as single file
 */
export interface IFileSnapshot {
    tree: ITree;
    commits: {[key: string]: ITree};
}

// IVersion.treeId used to communicate between getVersions() & getSnapshotTree() calls to indicate IVersion is ours.
const FileStorageVersionTreeId = "FileStorageTreeId";

class FileStorage extends ReplayStorageService {
    protected docId?: string;
    protected tree: ISnapshotTree;
    protected blobs = new Map<string, string>();
    protected commits: {[key: string]: ITree} = {};

    public constructor(json: IFileSnapshot) {
        super();
        this.commits = json.commits;
        const flattened = flatten(json.tree.entries, this.blobs);
        this.tree = buildHierarchy(flattened);
    }

    public async getVersions(
            versionId: string,
            count: number): Promise<IVersion[]> {
        if (this.docId === undefined || this.docId === versionId) {
            this.docId = versionId;
            return [{id: "latest", treeId: ""}];
        }

        if (this.commits[versionId] !== undefined) {
            return [{id: versionId, treeId: FileStorageVersionTreeId}];
        }
        throw new Error(`Unknown version ID: ${versionId}`);
    }

    public async getSnapshotTree(versionRequested?: IVersion): Promise<ISnapshotTree | null> {
        if (versionRequested && versionRequested.id !== "latest") {
            if (versionRequested.treeId !== FileStorageVersionTreeId) {
                throw new Error(`Unknown version id: ${versionRequested}`);
            }
            const tree = this.commits[versionRequested.id];
            if (tree === undefined) {
                throw new Error(`Can't find version ${versionRequested.id}`);
            }

            const flattened = flatten(tree.entries, this.blobs);
            return buildHierarchy(flattened);
        }
        return this.tree;
    }

    public async read(blobId: string): Promise<string> {
        const blob = this.blobs.get(blobId);
        if (blob !== undefined) {
            return blob;
        }
        throw new Error(`Unknown blob ID: ${blobId}`);
    }
}

class SnapshotStorage extends ReplayStorageService {
    protected docId?: string;

    constructor(
            protected readonly storage: IDocumentStorageService,
            protected readonly tree: ISnapshotTree | null) {
        super();
        assert(this.tree);
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        if (this.docId === undefined || this.docId === versionId) {
            this.docId = versionId;
            return [{id: "latest", treeId: ""}];
        }
        return this.storage.getVersions(versionId, count);
    }

    public async getSnapshotTree(versionRequested?: IVersion): Promise<ISnapshotTree | null> {
        if (versionRequested && versionRequested.id !== "latest") {
            return this.storage.getSnapshotTree(versionRequested);
        }

        return this.tree;
    }

    public read(blobId: string): Promise<string> {
        return this.storage.read(blobId);
    }
}

class OpStorage extends ReplayStorageService {
    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return [];
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        throw new Error("no snapshot tree should be asked when playing ops");
    }

    public async read(blobId: string): Promise<string> {
        throw new Error(`Unknown blob ID: ${blobId}`);
    }
}

const debuggerWindowHtml =
"<Title>Fluid Debugger</Title>\
<body>\
<h3>Fluid Debugger</h3>\
<select style='width:250px' id='selector'>\
<option>No snapshot</option>\
</select>\
&nbsp; &nbsp; &nbsp;\
<button id='buttonVers' style='width:60px'>Go</button>\
<input id='file' type='file' accept='snapshot.json'>File</input>\
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
export class DebugReplayController extends ReplayController {
    public static create(): DebugReplayController | undefined {
        if (
                typeof window !== "object" ||
                window === null ||
                typeof window.document !== "object" ||
                window.document == null ||
                typeof localStorage !== "object" ||
                localStorage === null) {
            console.log("Can't create debugger window - not running in browser!");
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
    protected readonly fileSnapshot: HTMLInputElement;
    protected readonly steps: HTMLInputElement;
    protected readonly text1: HTMLParagraphElement;
    protected readonly text2: HTMLParagraphElement;
    protected readonly text3: HTMLParagraphElement;
    protected readonly lastOpText: HTMLParagraphElement;

    protected stepsDeferred?: Deferred<number>;
    protected startSeqDeferred = new Deferred<number>();
    protected doneFetchingOps = false;
    protected documentStorageService?: IDocumentStorageService;
    protected versions: IVersion[] = [];
    protected stepsToPlay: number = 0;
    protected lastOpReached = false;

    protected storage?: ReplayStorageService;

    public constructor(protected readonly debuggerWindow: Window) {
        super();
        const doc = this.debuggerWindow.document;
        doc.write(debuggerWindowHtml);

        window.addEventListener("beforeunload", (e) => this.debuggerWindow.close(), false);

        this.buttonVers = doc.getElementById("buttonVers") as HTMLButtonElement;
        this.buttonOps = doc.getElementById("buttonOps") as HTMLButtonElement;
        this.selector = doc.getElementById("selector") as HTMLSelectElement;
        this.fileSnapshot = doc.getElementById("file") as HTMLInputElement;
        this.steps = doc.getElementById("steps") as HTMLInputElement;
        this.text1 = doc.getElementById("text1") as HTMLParagraphElement;
        this.text2 = doc.getElementById("text2") as HTMLParagraphElement;
        this.text3 = doc.getElementById("text3") as HTMLParagraphElement;
        this.lastOpText = doc.getElementById("lastOp") as HTMLParagraphElement;

        this.buttonVers.onclick = async () => {
            this.buttonVers.disabled = true;
            this.selector.disabled = true;
            this.fileSnapshot.disabled = true;

            let index = this.selector.selectedIndex;
            if (index === 0 || !this.documentStorageService) {
                // no snapshot
                this.resolveStorage(0, new OpStorage());
                return;
            }
            index--;
            if (index < 0 || index >= this.versions.length) {
                index = 0;
            }

            const tree = await this.documentStorageService.getSnapshotTree(this.versions[index]);
            const seq = await DebugReplayController.seqFromTree(this.documentStorageService, tree);
            this.resolveStorage(seq, new SnapshotStorage(this.documentStorageService, tree));
        };

        this.buttonOps.disabled = true;
        this.buttonOps.onclick = () => {
            const result = Number(this.steps.value);
            if (this.stepsDeferred && !Number.isNaN(result) && result > 0) {
                this.stepsDeferred.resolve(result);
            }
        };

        this.fileSnapshot.addEventListener("change", async () => {
            const files = this.fileSnapshot.files;
            if (files) {
                const file = files[0];
                if (file.name !== "snapshot.json") {
                    alert(`Incorrect file name: ${file.name}`);
                    return;
                }

                const reader = new FileReader();
                reader.onload = async () => {
                    if (this.documentStorageService) {
                        const text = reader.result as string;
                        try {
                            const json: IFileSnapshot = JSON.parse(text) as IFileSnapshot;
                            /*
                            const docStorage = this.documentStorageService;
                            const storage = {
                                read: (blobId: string) => this.read(docStorage, blobId),
                            };
                            const seq = await DebugReplayController.seqFromTree(
                                storage as IDocumentStorageService,
                                tree);
                            this.startSeqDeferred.resolve(seq);
                            */
                            // No ability to load ops, so just say - pick up from infinite op.
                            this.doneFetchingOps = true;
                            this.resolveStorage(
                                Number.MAX_SAFE_INTEGER,
                                new FileStorage(json));

                            this.buttonVers.disabled = true;
                            this.selector.disabled = true;
                            this.fileSnapshot.disabled = true;
                        } catch (error) {
                            alert(`Error parsing file: ${error}`);
                            return;
                        }
                    }
                };
                reader.readAsText(file, "utf-8");
            }
        }, false);
    }

    public fetchTo(currentOp: number): number {
        return currentOp + MaxBatchDeltas;
    }

    public async waitForSourceSelection(documentStorageService: IDocumentStorageService): Promise<void> {
        assert(documentStorageService);
        if (!this.documentStorageService) {
            this.documentStorageService = documentStorageService;

            this.versions = await documentStorageService.getVersions("", 50);
            if (this.versions.length === 0) {
                this.buttonVers.disabled = true;
                this.selector.disabled = true;
                this.resolveStorage(0, new OpStorage());
                return;
            }

            this.versions.map(async (version) => {
                const treeV = await documentStorageService.getSnapshotTree(version);
                const seqV = await DebugReplayController.seqFromTree(documentStorageService, treeV);

                const option = document.createElement("option");
                option.text = `id = ${version.id}   seq = ${seqV}`;
                this.selector.add(option);
            });
        }
        await this.startSeqDeferred.promise;
        assert(this.storage);
    }

    public resolveStorage(seq: number, storage: ReplayStorageService) {
        assert(!this.storage);
        assert(storage);
        this.storage = storage;
        this.startSeqDeferred.resolve(seq);
    }

    public initStorage(storage: IDocumentStorageService): Promise<void> {
        return this.waitForSourceSelection(storage);
    }

    public async read(blobId: string): Promise<string> {
        if (this.storage) {
            return this.storage.read(blobId);
        }
        throw new Error("Reading blob before storage is setup properly");
    }

    public async getVersions(
            versionId: string,
            count: number): Promise<IVersion[]> {
        if (this.storage) {
            return this.storage.getVersions(versionId, count);
        }
        throw new Error("initStorage() was not called!");
    }

    public async getSnapshotTree(versionRequested?: IVersion): Promise<ISnapshotTree | null> {
        if (this.storage) {
            return this.storage.getSnapshotTree(versionRequested);
        }
        throw new Error("Reading snapshot tree before storage is setup properly");
    }

    public getStartingOpSequence() {
        return this.startSeqDeferred.promise;
    }

    /**
     * Return true if we are done processing ops
     * Returning false as we want to continue to ping server for any new ops.
     */
    public isDoneFetch(currentOp: number, lastTimeStamp?: number): boolean {
        if (lastTimeStamp === undefined) {
            this.lastOpReached = true;
            this.lastOpText.textContent = `Last op: ${currentOp}`;
        }
        return this.doneFetchingOps;
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
