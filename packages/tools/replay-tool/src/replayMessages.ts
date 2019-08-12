/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as API from "@prague/client-api";
import {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
} from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import {
    FileDeltaStorageService,
    FileDocumentServiceFactory,
    FileSnapshotWriterClassFactory,
    FileStorageDocumentName,
    ISnapshotWriterStorage,
    PragueDumpReaderFileSnapshotWriter,
    Replayer,
    ReplayFileDeltaConnection,
} from "@prague/file-socket-storage";
import {
    IBlob,
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
    ISequencedDocumentMessage,
    ITree,
    ScopeType,
    TreeEntry,
} from "@prague/protocol-definitions";
import {
    FileSnapshotReader,
    IFileSnapshot,
} from "@prague/replay-socket-storage";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { generateToken } from "@prague/services-core";
import { ChildLogger, TelemetryLogger } from "@prague/utils";
import * as assert from "assert";
import * as child_process from "child_process";
import * as fs from "fs";
import { ReplayArgs } from "./replayTool";

// tslint:disable:non-literal-fs-path

/**
 * Logger to catch errors in containers
 */
class Logger implements ITelemetryBaseLogger {
    public constructor(private readonly containerDescription: string) {
    }

    // ITelemetryBaseLogger implementation
    public send(event: ITelemetryBaseEvent) {
        if (event.category === "error") {
            // Stack is not output properly (with newlines), if done as part of event
            const stack: string | undefined = event.stack as string | undefined;
            delete event.stack;
            console.error(`An error has been logged from ${this.containerDescription}!`);
            console.error(event);
            if (stack) {
                console.error(stack);
            }
        }
    }
}

/**
 * helper class holding container and providing load / snapshot capabilities
 */
class Document {
    private container: Container;
    private replayer: Replayer;
    private documentSeqNumber = 0;
    private from = -1;
    private snapshotFileName: string = "";
    private docLogger: TelemetryLogger;

    public constructor(
            protected readonly args: ReplayArgs,
            public readonly storage: ISnapshotWriterStorage) {
    }

    public get currentOp() {
        return this.replayer.currentReplayedOp;
    }

    public get fromOp() {
        return this.from;
    }

    public get logger() {
        return this.docLogger;
    }

    public getFileName() {
        return this.snapshotFileName;
    }

    public setFileName(filename: string) {
        this.snapshotFileName = filename;
    }

    public async load(deltaStorageService: FileDeltaStorageService, containerDescription: string) {
        const deltaConnection = await ReplayFileDeltaConnection.create(deltaStorageService);
        const documentServiceFactory = new FileDocumentServiceFactory(
            this.storage,
            deltaStorageService,
            deltaConnection);

        this.container = await this.loadContainer(
            documentServiceFactory,
            containerDescription);

        this.from = this.container.deltaManager.referenceSequenceNumber;
        this.replayer = deltaConnection.getReplayer();

        this.replayer.currentReplayedOp = this.from;

        this.snapshotFileName = `snapshot_${this.fromOp}`;

        this.container.on("op", (message: ISequencedDocumentMessage) => {
            this.documentSeqNumber = message.sequenceNumber;
            if (this.currentOp === this.documentSeqNumber) {
                this.resolveC();
            }
        });
    }

    public async replay(replayTo: number) {
        this.replayer.replay(replayTo);

        if (this.documentSeqNumber !== this.currentOp) {
            // tslint:disable-next-line: promise-must-complete
            await new Promise((resolve) => {
                this.resolveC = resolve;
            });
            assert.equal(this.documentSeqNumber, this.currentOp);
        }
    }

    public snapshot() {
        return this.container.snapshot(
            `ReplayTool Snapshot: op ${this.currentOp}, ${this.getFileName()}`,
            !this.args.incremental /*generateFullTreeNoOtimizations*/);
    }

    private resolveC = () => {};

    private async loadContainer(
            serviceFactory: IDocumentServiceFactory,
            containerDescription: string,
            ): Promise<Container> {
        const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: "replay.com",
                ordererUrl: "replay.com",
                storageUrl: "replay.com",
            },
            tokens: { jwt: generateToken("prague", "replay-tool", "replay-tool", scopes) },
            type: "prague",
            url: `prague://localhost:6000/prague/${FileStorageDocumentName}`,
        };

        const resolver = new ContainerUrlResolver(
            "",
            "",
            new Map<string, IResolvedUrl>([[resolved.url, resolved]]));
        const host = { resolver };

        const codeLoader = new API.CodeLoader({ generateSummaries: false });
        const options = {};

        // Load the Fluid document
        this.docLogger = ChildLogger.create(new Logger(containerDescription));
        const loader = new Loader(host, serviceFactory, codeLoader, options, this.docLogger);
        const container: Container = await loader.resolve({ url: resolved.url });

        assert(container.existing); // ReplayFileDeltaConnection.create() guarantees that

        return container;
    }
}

/**
 * All the logic of replay tool
 */
export class ReplayTool {
    private storage: ISnapshotWriterStorage;
    private mainDocument: Document;
    private documentNeverSnapshot?: Document;
    private documentPriorSnapshot?: Document;
    private readonly documents: Document[] = [];
    private readonly documentsWindow: Document[] = [];
    private readonly documentsFromStorageSnapshots: Document[] = [];
    private windiffCount = 0;
    private deltaStorageService: FileDeltaStorageService;

    public constructor(private readonly args: ReplayArgs) {}

    public async Go() {
        await this.setup();

        if (this.args.verbose) {
            console.log("Starting");
        }

        await this.mainCycle();

        if (this.args.verbose) {
            console.log("\nLast replayed op seq# ", this.mainDocument.currentOp);
        } else {
            process.stdout.write("\n");
        }
        assert(this.documentsFromStorageSnapshots.length === 0);
    }

    private async setup() {
        if (this.args.inDirName === undefined) {
            return Promise.reject("Please provide --indir argument");
        }
        if (!fs.existsSync(this.args.inDirName)) {
            return Promise.reject("File does not exist");
        }

        this.deltaStorageService = new FileDeltaStorageService(this.args.inDirName);

        this.storage = new PragueDumpReaderFileSnapshotWriter(this.args.inDirName, this.args.version);
        this.mainDocument = new Document(this.args, this.storage);
        await this.mainDocument.load(
            this.deltaStorageService,
            this.args.version ? this.args.version : "main container");
        this.documents.push(this.mainDocument);

        if (this.args.version !== undefined) {
            console.log(`Starting from ${this.args.version}, seq# = ${this.mainDocument.currentOp}`);
            if (this.mainDocument.currentOp > this.args.to) {
                console.log("Warning: --to argument is below snapshot starting op");
            }
        }

        if (this.args.snapFreq !== Number.MAX_SAFE_INTEGER || this.args.validateSotrageSnapshots) {
            const storage = new PragueDumpReaderFileSnapshotWriter(this.args.inDirName, this.args.version);
            this.documentNeverSnapshot = new Document(this.args, storage);
            await this.documentNeverSnapshot.load(
                this.deltaStorageService,
                this.args.version ? this.args.version : "secondary container");
            this.documentNeverSnapshot.setFileName(`snapshot_${this.documentNeverSnapshot.fromOp}_noSnapshots`);
            this.documents.push(this.documentNeverSnapshot);
        }

        // Load all snapshots from storage
        if (this.args.validateSotrageSnapshots) {
            for (const node of fs.readdirSync(this.args.inDirName, {withFileTypes: true})) {
                if (!node.isDirectory()) {
                    continue;
                }
                const storage = new PragueDumpReaderFileSnapshotWriter(this.args.inDirName, node.name);
                const doc = new Document(this.args, storage);
                try {
                    await doc.load(this.deltaStorageService, node.name);
                    doc.setFileName(`${doc.getFileName()}_storage_${node.name}`);

                    if (doc.fromOp < this.args.from || this.args.to < doc.fromOp) {
                        console.log(`Skipping snapshots ${node.name} generated at op = ${doc.fromOp}`);
                    } else {
                        console.log(`Loaded snapshots ${node.name} generated at op = ${doc.fromOp}`);
                        this.documentsFromStorageSnapshots.push(doc);
                    }
                } catch (error) {
                    doc.logger.logException({ eventName: "FailedToLoadSnapshot" }, error);
                }
            }
            this.documentsFromStorageSnapshots.sort((a: Document, b: Document) => {
                return a.fromOp > b.fromOp ? 1 : -1;
            });
        }
    }

    private async mainCycle() {
        let nextSnapPoint = this.args.from;

        while (true) {
            const currentOp = this.mainDocument.currentOp;
            if (nextSnapPoint <= currentOp) {
                nextSnapPoint = currentOp + this.args.snapFreq;
            }
            let replayTo = Math.min(nextSnapPoint, this.args.to);

            if (this.documentsFromStorageSnapshots.length > 0) {
                const op = this.documentsFromStorageSnapshots[0].fromOp;
                replayTo = Math.min(replayTo, op);
            }

            assert(replayTo > currentOp);
            for (const doc of this.documents) {
                await doc.replay(replayTo);
            }
            if (this.documentPriorSnapshot) {
                await this.documentPriorSnapshot.replay(replayTo);
            }
            for (const doc of this.documentsWindow) {
                await doc.replay(replayTo);
            }

            const final = this.mainDocument.currentOp < replayTo || this.args.to <= this.mainDocument.currentOp;
            if (this.args.takeSnapshots()) {
                await this.generateSnapshot(final);
            }
            if (final) {
                break;
            }
        }
    }

    private async generateSnapshot(final: boolean) {
        const op = this.mainDocument.currentOp;
        const dir = `${this.args.outDirName}/op_${op}`;
        let snapshotSaved: IFileSnapshot | undefined;
        let snapshotSavedString: string | undefined;

        const createSnapshot = this.args.createAllFiles || (final && this.args.takeSnapshot);
        if (createSnapshot) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.storage.onCommitHandler = (componentName: string, tree: ITree) => {
            if (this.args.createAllFiles) {
                const filename = componentName.replace(/(\\|\/)/gm, "_");
                fs.writeFileSync(
                    `${dir}/${filename}.json`,
                    JSON.stringify(tree, undefined, 2),
                    {encoding: "utf-8"});
            }
        };

        this.storage.onSnapshotHandler = (snapshot: IFileSnapshot) => {
            snapshotSaved = snapshot;
            snapshotSavedString = JSON.stringify(snapshot, undefined, 2);
            if (createSnapshot) {
                this.expandForReadabilityAndWriteOut(snapshotSaved, `${dir}/${this.mainDocument.getFileName()}`);
            }
        };

        if (this.args.verbose) {
            if (this.args.createAllFiles) {
                console.log(`Writing snapshot at seq# ${op}`);
            } else {
                console.log(`Validating snapshot at seq# ${op}`);
            }
        }
        await this.mainDocument.snapshot();
        if (snapshotSaved === undefined) {
            // Snapshots are not created if there is no "code2" proposal
            if (op >= 4) {
                console.error(`\nSnapshot ${this.mainDocument.getFileName()} was not saved for op # ${op}!`);
            }
            return;
        }

        // Load it back to prove it's correct
        const storageClass = FileSnapshotWriterClassFactory(FileSnapshotReader);
        const storage2 = new storageClass(snapshotSaved);
        const document2 = new Document(this.args, storage2);
        await document2.load(this.deltaStorageService, `Saved & loaded at seq# ${op}`);
        await this.saveAndVerify(document2, dir, snapshotSaved, snapshotSavedString);

        // Add extra container
        if (!final && ((op - this.mainDocument.fromOp) % this.args.snapFreq) === 0) {
            storage2.reset();
            const document3 = new Document(this.args, storage2);
            await document3.load(this.deltaStorageService, `Saved & loaded at seq# ${op}`);
            this.documentsWindow.push(document3);
        }

        if (final && this.documentNeverSnapshot) {
            await this.saveAndVerify(this.documentNeverSnapshot, dir, snapshotSaved, snapshotSavedString);
        }

        const startOp = op - this.args.opsToSkip;
        while (this.documentsWindow.length > 0
                && (final || this.documentsWindow[0].fromOp <= startOp)) {
            const doc = this.documentsWindow.shift();
            assert(doc.fromOp === startOp || final);
            await this.saveAndVerify(doc, dir, snapshotSaved, snapshotSavedString);
        }

        const processVersionedSnapshot = this.documentsFromStorageSnapshots.length > 0 &&
            this.documentsFromStorageSnapshots[0].fromOp <= op;
        if (this.documentPriorSnapshot && (processVersionedSnapshot || final)) {
            await this.saveAndVerify(this.documentPriorSnapshot, dir, snapshotSaved, snapshotSavedString);
            this.documentPriorSnapshot = undefined;
        }
        if (processVersionedSnapshot) {
            this.documentPriorSnapshot = this.documentsFromStorageSnapshots.shift();
            assert(this.documentPriorSnapshot.fromOp === op);
            await this.saveAndVerify(this.documentPriorSnapshot, dir, snapshotSaved, snapshotSavedString);
        }

        /*
        if (this.args.createAllFiles) {
            // Follow up:
            // Summary needs commits (same way as snapshot), that is available in
            // PragueDumpReaderFileSnapshotWriter.write()
            const summaryTree = await container.summarize(true);
            const file = `${dir}/summary.json`;
            fs.writeFileSync(file, JSON.stringify(summaryTree, undefined, 2));
        }
        */
    }

    private async saveAndVerify(
            document2: Document,
            dir: string,
            snapshotSaved: IFileSnapshot,
            snapshotSavedString: string): Promise<boolean> {
        let snapshotSaved2: IFileSnapshot | undefined;
        let snapshotSaved2String: string | undefined;
        const op = document2.currentOp;

        assert(this.mainDocument.currentOp === op);

        const name1 = this.mainDocument.getFileName();
        const name2 = document2.getFileName();

        document2.storage.onCommitHandler = (componentName: string, tree: ITree) => {};
        document2.storage.onSnapshotHandler = (snapshot: IFileSnapshot) => {
            snapshotSaved2 = snapshot;
            snapshotSaved2String = JSON.stringify(snapshot, undefined, 2);
            if (this.args.createAllFiles) {
                fs.writeFileSync(
                    `${dir}/${name2}.json`,
                    snapshotSaved2String,
                    { encoding: "utf-8" });
                }
        };

        await document2.snapshot();
        if (snapshotSaved2String === undefined) {
            console.error(`\nSnapshot ${document2.getFileName()} was not saved at op # ${op}!`);
            return false;
        }

        if (snapshotSavedString !== snapshotSaved2String) {
            // tslint:disable-next-line:max-line-length
            console.error(`\nOp ${op}: Discrepancy between ${name1} & ${name2}! Likely a bug in snapshot load-save sequence!`);
            fs.mkdirSync(dir, { recursive: true });

            this.expandForReadabilityAndWriteOut(snapshotSaved, `${dir}/${name1}`);
            this.expandForReadabilityAndWriteOut(snapshotSaved2, `${dir}/${name2}`);

            if (this.args.windiff) {
                console.log(`windiff.exe "${dir}/${name1}_expanded.json" "${dir}/${name2}_expanded.json"`);
                this.windiffCount++;
                if (this.windiffCount <= 10) {
                    child_process.exec(`windiff.exe "${dir}/${name1}_expanded.json" "${dir}/${name2}_expanded.json"`);
                } else if (this.windiffCount === 10) {
                    console.error("Launched 10 windiff processes, stopping!");
                }
            }
            return false;
        }

        if (!this.args.verbose) {
            process.stdout.write(".");
        }
        return true;
    }

    private expandForReadabilityAndWriteOut(snapshot: IFileSnapshot, filename: string) {
        fs.writeFileSync(
            `${filename}.json`,
            JSON.stringify(snapshot, undefined, 2),
            { encoding: "utf-8" });

        const snapshotExpanded: IFileSnapshot = {
            commits: {},
            tree: this.expandTreeForReadability(snapshot.tree),
        };
        for (const commit of Object.keys(snapshot.commits)) {
            snapshotExpanded.commits[commit] = this.expandTreeForReadability(snapshot.commits[commit]);
        }

        fs.writeFileSync(
            `${filename}_expanded.json`,
            JSON.stringify(snapshotExpanded, undefined, 2),
            { encoding: "utf-8" });
    }

    private expandTreeForReadability(tree: ITree): ITree {
        const newTree: ITree = {entries: [], id: undefined};
        for (const node of tree.entries) {
            const newNode = {...node};
            if (node.type === TreeEntry[TreeEntry.Tree]) {
                newNode.value = this.expandTreeForReadability(node.value as ITree);
            }
            if (node.type === TreeEntry[TreeEntry.Blob]) {
                const blob = node.value as IBlob;
                try {
                    newNode.value = {
                        contents: JSON.parse(blob.contents) as string,
                        encoding: blob.encoding,
                    };
                } catch (e) {}
            }
            newTree.entries.push(newNode);
        }
        return newTree;
    }
}
