/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { Deferred } from "@fluidframework/common-utils";
import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import { readAndParse } from "@microsoft/fluid-driver-utils";
import {
    IDocumentAttributes,
    ISequencedDocumentMessage,
    ISnapshotTree,
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import {
    FileSnapshotReader,
    IFileSnapshot,
    OpStorage,
    ReadDocumentStorageServiceBase,
    ReplayController,
    SnapshotStorage,
} from "@microsoft/fluid-replay-driver";
import { IDebuggerController, IDebuggerUI } from "./fluidDebuggerUi";

export type debuggerUIFactory = (controller: IDebuggerController) => IDebuggerUI | null;

const MaxBatchDeltas = 2000;

/**
 * Replay controller that uses pop-up window to control op playback
 */
export class DebugReplayController extends ReplayController implements IDebuggerController {
    public static create(
        createUi: debuggerUIFactory): DebugReplayController | null {
        if (typeof localStorage === "object" && localStorage !== null && localStorage.FluidDebugger) {
            const controller = new DebugReplayController();
            const ui = createUi(controller);
            if (ui) {
                return controller;
            }
        }
        return null;
    }

    protected static readonly WindowClosedSeq = -1; // Seq# to indicate that user closed window

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

    protected ui: IDebuggerUI = null as any as IDebuggerUI; // Not to check on every line that it's not null
    protected stepsDeferred?: Deferred<number>;
    protected startSeqDeferred = new Deferred<number>();

    // True will cause us ping server indefinitely waiting for new ops
    protected retryFetchOpsOnEndOfFile = false;

    protected documentStorageService?: IDocumentStorageService;
    protected versions: IVersion[] = [];
    protected stepsToPlay: number = 0;
    protected lastOpReached = false;
    protected versionCount = 0;

    protected storage?: ReadDocumentStorageServiceBase;

    // Member to prevent repeated initialization in initStorage(...), which also
    // returns if this controller should be used or function as a passthrough
    private shouldUseController: boolean | undefined;

    public connectToUi(ui: IDebuggerUI): void {
        this.ui = ui;
    }

    public onClose() {
        this.startSeqDeferred.resolve(DebugReplayController.WindowClosedSeq);
    }

    public async onVersionSelection(version?: IVersion) {
        if (version === undefined) {
            this.resolveStorage(0, new OpStorage());
            return;
        }

        if (!this.documentStorageService) {
            throw new Error("onVersionSelection: no storage");
        }

        const tree = await this.documentStorageService.getSnapshotTree(version);
        const seq = await DebugReplayController.seqFromTree(this.documentStorageService, tree);
        this.resolveStorage(
            seq,
            new SnapshotStorage(this.documentStorageService, tree),
            version);
    }

    public onOpButtonClick(steps: number) {
        if (this.stepsDeferred && !Number.isNaN(steps) && steps > 0) {
            this.stepsDeferred.resolve(steps);
        }
    }

    public onSnapshotFileSelection(file: File) {
        if (!/^snapshot.*\.json/.exec(file.name)) {
            alert(`Incorrect file name: ${file.name}`);
            return;
        }
        if (/.*_expanded.*/.exec(file.name)) {
            alert(`Incorrect file name - please use non-extended files: ${file.name}`);
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            if (this.documentStorageService) {
                const text = reader.result as string;
                try {
                    const json: IFileSnapshot = JSON.parse(text) as IFileSnapshot;
                    /*
                    Const docStorage = this.documentStorageService;
                    const storage = {
                        read: (blobId: string) => this.read(docStorage, blobId),
                    };
                    const seq = await DebugReplayController.seqFromTree(
                        storage as IDocumentStorageService,
                        tree);
                    this.startSeqDeferred.resolve(seq);
                    */
                    // No ability to load ops, so just say - pick up from infinite op.
                    this.retryFetchOpsOnEndOfFile = false;
                    this.lastOpReached = true;
                    this.resolveStorage(
                        Number.MAX_SAFE_INTEGER,
                        new FileSnapshotReader(json),
                        file.name);
                } catch (error) {
                    alert(`Error parsing file: ${error}`);
                    return;
                }
            }
        };
        reader.readAsText(file, "utf-8");
    }

    public fetchTo(currentOp: number): number {
        return currentOp + MaxBatchDeltas;
    }

    // Returns true if version / file / ops selections is made.
    public isSelectionMade() {
        return this.storage !== undefined;
    }

    public async downloadVersionInfo(
        documentStorageService: IDocumentStorageService,
        prevRequest: Promise<void>,
        index: number,
        version: IVersion): Promise<void> {
        if (this.isSelectionMade()) {
            return;
        }

        await prevRequest;

        const treeV = await documentStorageService.getSnapshotTree(version);
        const seqV = await DebugReplayController.seqFromTree(documentStorageService, treeV);

        if (!this.isSelectionMade()) {
            this.versionCount--;
            this.ui.updateVersionText(this.versionCount);
            this.ui.updateVersion(index, version, seqV);
        }
    }

    public async initStorage(documentStorageService: IDocumentStorageService): Promise<boolean> {
        if (this.shouldUseController !== undefined) {
            return this.shouldUseController;
        }

        assert(documentStorageService);
        assert(!this.documentStorageService);
        this.documentStorageService = documentStorageService;

        // User can chose "no snapshot" or "file" at any moment in time!
        if (!this.isSelectionMade()) {
            this.versions = await documentStorageService.getVersions("", 50);
            if (!this.isSelectionMade()) {
                this.ui.addVersions(this.versions);
                this.ui.updateVersionText(this.versionCount);
            }
        }

        /* Short circuit for when we have no versions
        we do not want to use it to leave ability for user to close window and use real storage.
        if (!this.isSelectionMade() && this.versions.length === 0) {
            this.text1.textContent = "";
            this.resolveStorage(0, new OpStorage());
            return true;
        }
        */

        this.versionCount = this.versions.length;

        // Download all versions - do 10 downloads in parallel to avoid being throttled
        const buckets = 10;
        const work: Promise<void>[] = [];
        for (let i = 0; i < buckets; i++) {
            let prevRequest = Promise.resolve();
            for (let index = i; index < this.versions.length; index += buckets) {
                const version = this.versions[index];
                prevRequest = this.downloadVersionInfo(documentStorageService, prevRequest, index, version);
            }
            work.push(prevRequest);
        }

        // Don't wait for stuff to populate.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.all(work).then(() => {
            this.ui.updateVersionText(0);
        });

        this.shouldUseController = await this.startSeqDeferred.promise !== DebugReplayController.WindowClosedSeq;
        assert(this.isSelectionMade() === this.shouldUseController);
        return this.shouldUseController;
    }

    public async read(blobId: string): Promise<string> {
        if (this.storage !== undefined) {
            return this.storage.read(blobId);
        }
        throw new Error("Reading blob before storage is setup properly");
    }

    public async getVersions(
        versionId: string,
        count: number): Promise<IVersion[]> {
        if (this.storage !== undefined) {
            return this.storage.getVersions(versionId, count);
        }
        throw new Error("initStorage() was not called!");
    }

    public async getSnapshotTree(versionRequested?: IVersion): Promise<ISnapshotTree | null> {
        if (this.storage !== undefined) {
            return this.storage.getSnapshotTree(versionRequested);
        }
        throw new Error("Reading snapshot tree before storage is setup properly");
    }

    public async getStartingOpSequence() {
        return this.startSeqDeferred.promise;
    }

    /**
     * Return true if we are done processing ops
     */
    public isDoneFetch(currentOp: number, lastTimeStamp?: number): boolean {
        if (lastTimeStamp === undefined) {
            this.lastOpReached = true;
            if (currentOp === Number.MAX_SAFE_INTEGER) {
                this.ui.updateLastOpText(-1, false);
            } else {
                this.ui.updateLastOpText(currentOp, false);
            }
        } else {
            this.ui.updateLastOpText(currentOp, true);
        }
        return this.lastOpReached && !this.retryFetchOpsOnEndOfFile;
    }

    public async replay(
        emitter: (op: ISequencedDocumentMessage[]) => void,
        fetchedOps: ISequencedDocumentMessage[]): Promise<void> {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (fetchedOps.length === 0) {
                this.ui.updateNextOpText([]);
                return;
            }

            if (this.stepsToPlay === 0) {
                this.ui.disableNextOpButton(false);
                this.stepsDeferred = new Deferred<number>();

                this.ui.updateNextOpText(fetchedOps);

                this.stepsToPlay = await this.stepsDeferred.promise;

                this.stepsDeferred = undefined;
                this.ui.disableNextOpButton(true);
            }

            let playOps: ISequencedDocumentMessage[];
            if (this.stepsToPlay >= fetchedOps.length) {
                playOps = fetchedOps;
                this.stepsToPlay -= fetchedOps.length;
                // eslint-disable-next-line no-param-reassign
                fetchedOps = [];
            } else {
                playOps = fetchedOps.splice(0, this.stepsToPlay);
                this.stepsToPlay = 0;
            }
            emitter(playOps);
        }
    }

    protected resolveStorage(
        seq: number,
        storage: ReadDocumentStorageServiceBase,
        version?: IVersion | string) {
        assert(!this.isSelectionMade());
        assert(storage);
        this.storage = storage;
        assert(this.isSelectionMade());

        this.ui.versionSelected(seq, version);
        this.startSeqDeferred.resolve(seq);
    }
}
