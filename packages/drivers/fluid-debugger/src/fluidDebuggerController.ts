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
import {
    FileSnapshotReader,
    IFileSnapshot,
    OpStorage,
    ReadDocumentStorageServiceBase,
    ReplayController,
    SnapshotStorage,
} from "@prague/replay-socket-storage";
import { Deferred, readAndParse } from "@prague/utils";
import * as assert from "assert";
import { IDebuggerController, IDebuggerUI } from "./fluidDebuggerUI";

export type debuggerUIFactory = (controller: IDebuggerController) => IDebuggerUI | null;

const MaxBatchDeltas = 2000;

/**
 * Replay controller that uses pop-up window to control op playback
 */
export class DebugReplayController extends ReplayController implements IDebuggerController {
    public static create(
            createUi: debuggerUIFactory): DebugReplayController | null {
        if (localStorage.FluidDebugger) {
            const controller = new DebugReplayController();
            const ui = createUi(controller);
            if (ui) {
                return controller;
            }
        }
        return null;
    }

    protected static readonly WindowClosedSeq = -1; // seq# to indicate that user closed window

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

    protected ui: IDebuggerUI = null as any as IDebuggerUI; // not to check on every line that it's not null
    protected stepsDeferred?: Deferred<number>;
    protected startSeqDeferred = new Deferred<number>();
    protected doneFetchingOps = false;
    protected documentStorageService?: IDocumentStorageService;
    protected versions: IVersion[] = [];
    protected stepsToPlay: number = 0;
    protected lastOpReached = false;

    protected storage?: ReadDocumentStorageServiceBase;

    public connectToUi(ui: IDebuggerUI): void {
        this.ui = ui;
    }

    public onClose() {
        this.startSeqDeferred.resolve(DebugReplayController.WindowClosedSeq);
    }

    public async onVersionSelection(indexS: number) {
        if (indexS === 0 || !this.documentStorageService) {
            // no snapshot
            this.resolveStorage("Playing from seq# 0", 0, new OpStorage());
            return;
        }
        let index = indexS - 1;
        if (index < 0 || index >= this.versions.length) {
            index = 0;
        }

        const version = this.versions[index];
        const tree = await this.documentStorageService.getSnapshotTree(version);
        const seq = await DebugReplayController.seqFromTree(this.documentStorageService, tree);
        this.resolveStorage(
                `Playing from ${version.id}, seq# ${seq}`,
                seq,
                new SnapshotStorage(this.documentStorageService, tree));
    }

    public onOpButtonClick(steps: number) {
        if (this.stepsDeferred && !Number.isNaN(steps) && steps > 0) {
            this.stepsDeferred.resolve(steps);
        }
    }

    public onSnapshotFileSelection(file: File) {
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
                        `Playing ${file.name} file`,
                        Number.MAX_SAFE_INTEGER,
                        new FileSnapshotReader(json));
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

    public async initStorage(documentStorageService: IDocumentStorageService): Promise<boolean> {
        assert(documentStorageService);
        assert(!this.documentStorageService);
        this.documentStorageService = documentStorageService;

        // User can chose "no snapshot" or "file" at any moment in time!
        if (this.storage === undefined) {
            this.ui.updateVersionText("Fetching snapshots, please wait...");
            this.versions = await documentStorageService.getVersions("", 50);
        }

        /* Short circuit for when we have no versions
        we do not want to use it to leave ability for user to close window and use real storage.
        if (this.storage === undefined && this.versions.length === 0) {
            this.text1.textContent = "";
            this.resolveStorage(0, new OpStorage());
            return true;
        }
        */

        let versionCount = this.versions.length;

        // Order versions, but also do not do too many parallel requests.
        // Can be done better (faster) in the future.
        let prevRequest = Promise.resolve();
        this.versions.map((version) => {
            if (this.storage === undefined) {
                prevRequest = prevRequest.then(async () => {
                    this.ui.updateVersionText(`Fetching information about ${versionCount} snapshots...`);
                    versionCount--;

                    const treeV = await documentStorageService.getSnapshotTree(version);
                    const seqV = await DebugReplayController.seqFromTree(documentStorageService, treeV);

                    this.ui.addVersion(`id = ${version.id}   seq = ${seqV}`);

                });
            }
        });

        // Don't wait for stuff to populate.
        // tslint:disable-next-line:no-floating-promises
        prevRequest.then(() => {
            this.ui.updateVersionText("");
        });

        const useController = await this.startSeqDeferred.promise !== DebugReplayController.WindowClosedSeq;
        assert((this.storage !== undefined) === useController);
        return useController;
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
            if (currentOp === Number.MAX_SAFE_INTEGER) {
                this.ui.updateLastOpText(`FluidDebugger can't play ops in this mode`);
            } else {
                this.ui.updateLastOpText(`Document's last op seq#: ${currentOp}`);
            }
        }
        return this.doneFetchingOps;
    }

    public async replay(
            emitter: (op: ISequencedDocumentMessage) => void,
            fetchedOps: ISequencedDocumentMessage[]): Promise<void> {

        if (!this.lastOpReached) {
            const op = fetchedOps[fetchedOps.length - 1];
            const lastSeq = op.sequenceNumber;
            this.ui.updateLastOpText(`Last op (still loading): ${lastSeq}`);
        }
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
                // tslint:disable-next-line:no-parameter-reassignment
                fetchedOps = [];
            } else {
                playOps = fetchedOps.splice(0, this.stepsToPlay);
                this.stepsToPlay = 0;
            }
            playOps.map(emitter);
        }
    }

    protected resolveStorage(versionInfo: string, seq: number, storage: ReadDocumentStorageServiceBase) {
        assert(!this.storage);
        assert(storage);
        this.storage = storage;

        this.ui.versionSelected(versionInfo);
        this.startSeqDeferred.resolve(seq);
    }
}
