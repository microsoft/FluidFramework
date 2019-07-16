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
import { IReplayController } from "./replayController";
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

enum LoadSource {
    Undecided,
    file,
    ops,
    snapshot,
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
export class DebugReplayController implements IReplayController {
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
    protected documentStorageService?: IDocumentStorageService;
    protected versions: IVersion[] = [];
    protected stepsToPlay: number = 0;
    protected lastOpReached = false;

    protected source: LoadSource = LoadSource.Undecided;
    protected tree: ISnapshotTree | null = null;
    protected blobs = new Map<string, string>();
    private commits: {[key: string]: ITree} = {};

    public constructor(protected readonly debuggerWindow: Window) {
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
                this.source = LoadSource.ops;
                this.startSeqDeferred.resolve(0);
                return;
            }
            index--;
            if (index < 0 || index >= this.versions.length) {
                index = 0;
            }

            this.source = LoadSource.snapshot;
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
                            this.commits = json.commits;
                            const flattened = flatten(json.tree.entries, this.blobs);
                            this.tree = buildHierarchy(flattened);
                            this.source = LoadSource.file;

                            /*
                            const docStorage = this.documentStorageService;
                            const storage = {
                                read: (blobId: string) => this.read(docStorage, blobId),
                            };
                            const seq = await DebugReplayController.seqFromTree(
                                storage as IDocumentStorageService,
                                this.tree);
                            this.startSeqDeferred.resolve(seq);
                            */
                            // No ability to load ops, so just say - pick up from infinite op.
                            this.startSeqDeferred.resolve(Number.MAX_SAFE_INTEGER);

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

    public async read(documentStorageService: IDocumentStorageService, blobId: string): Promise<string> {
        // For cases where we load snapshot from file, we need to use local cache
        const blob = this.blobs.get(blobId);
        if (blob !== undefined) {
            assert(this.source === LoadSource.file);
            return blob;
        }
        // For cases where we load version from storage, we need to go to storage
        assert(this.source === LoadSource.snapshot);
        return documentStorageService.read(blobId);
    }

    public async getVersions(
            documentStorageService: IDocumentStorageService,
            versionId: string,
            count: number): Promise<IVersion[]> {
        // Redirect only first call to "our" version/snapshot
        // Better check would be to check versionID === documentID, but we do not have documentID.
        if (this.tree === null) {
            // everything else is possible as user can select it sooner then this call comes in.
            assert(this.source !== LoadSource.snapshot);
            return [{id: "latest", treeId: ""}];
        }

        if (this.commits[versionId] !== undefined) {
            assert(this.source === LoadSource.file);
            return [{id: versionId, treeId: FileStorageVersionTreeId}];
        }

        assert(this.source === LoadSource.snapshot);
        return documentStorageService.getVersions(versionId, count);
    }

    public async getSnapshotTree(
                documentStorageService: IDocumentStorageService,
                versionRequested?: IVersion): Promise<ISnapshotTree | null> {
        if (versionRequested && versionRequested.id !== "latest") {
            if (versionRequested.treeId === FileStorageVersionTreeId) {
                assert(this.source === LoadSource.file);
                const tree = this.commits[versionRequested.id];
                if (tree === undefined) {
                    console.error(`Can't find version ${versionRequested.id}`);
                    return null;
                }

                const flattened = flatten(tree.entries, this.blobs);
                return buildHierarchy(flattened);
            }

            assert(this.source === LoadSource.snapshot);
            return documentStorageService.getSnapshotTree(versionRequested);
        }

        if (!this.documentStorageService) {
            this.documentStorageService = documentStorageService;

            // User may have clicked "no snapshot" before we had a chance to populate snapshots
            if (this.source !== LoadSource.ops) {
                assert(this.source === LoadSource.Undecided);

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
        } else {
            assert(documentStorageService === this.documentStorageService);
            // we already returned "no version"
            assert(!versionRequested);
            assert(this.source === LoadSource.ops);
            assert(this.tree === null);
        }

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
        if (lastTimeStamp === undefined) {
            this.lastOpReached = true;
            this.lastOpText.textContent = `Last op: ${currentOp}`;
        }
        return this.source === LoadSource.file;
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
