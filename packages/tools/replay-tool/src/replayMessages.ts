/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as API from "@prague/client-api";
import {
    IBlob,
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
    ISequencedDocumentMessage,
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    ITree,
    TreeEntry,
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
    FileSnapshotReader,
    IFileSnapshot,
} from "@prague/replay-socket-storage";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { generateToken } from "@prague/services-core";
import * as assert from "assert";
import * as child_process from "child_process";
import * as fs from "fs";
import { ReplayArgs } from "./replayTool";

// tslint:disable:non-literal-fs-path

/**
 * Logger to catch errors in containers
 */
class Logger implements ITelemetryBaseLogger {
    public constructor(private readonly version?: string) {
    }

    // ITelemetryBaseLogger implementation
    public send(event: ITelemetryBaseEvent) {
        if (event.category === "error") {
            // Stack is not output properly (with newlines), if done as part of event
            const stack: string | undefined = event.stack as string | undefined;
            delete event.stack;
            console.error("An error has been logged!");
            if (this.version !== undefined) {
                console.error(`From container version ${this.version}`);
            }
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

    public getFileName() {
        return this.snapshotFileName;
    }

    public setFileName(filename: string) {
        this.snapshotFileName = filename;
    }

    public async load(version?: string) {
        const deltaStorageService = new FileDeltaStorageService(this.args.inDirName);
        const deltaConnection = await ReplayFileDeltaConnection.create(deltaStorageService);
        const documentServiceFactory = new FileDocumentServiceFactory(
            this.storage,
            deltaStorageService,
            deltaConnection);

        this.container = await this.loadContainer(
            documentServiceFactory,
            version);

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
        await this.replayer.replay(replayTo);

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
            true /*generateFullTreeNoOtimizations*/);
    }

    private resolveC = () => {};

    private async loadContainer(
            serviceFactory: IDocumentServiceFactory,
            version?: string,
            ): Promise<Container> {
        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: "replay.com",
                ordererUrl: "replay.com",
                storageUrl: "replay.com",
            },
            tokens: { jwt: generateToken("prague", "replay-tool", "replay-tool") },
            type: "prague",
            url: `prague://localhost:6000/prague/${FileStorageDocumentName}`,
        };

        const resolver = new ContainerUrlResolver(
            "",
            "",
            new Map<string, IResolvedUrl>([[resolved.url, resolved]]));
        const host = { resolver };

        const codeLoader = new API.CodeLoader({ generateSummaries: false });

        const options: object = {
            blockUpdateMarkers: true,
            generateFullTreeNoOptimizations: true,
        };

        // Load the Fluid document
        const loader = new Loader(host, serviceFactory, codeLoader, options, new Logger(version));
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
    private readonly snapshots = new Map<number, IFileSnapshot>();
    private mainDocument: Document;
    private documentNeverSnapshot?: Document;
    private readonly documentsWindow: Document[] = [];
    private readonly documentsFromStorageSnapshots: Document[] = [];

    public constructor(private readonly args: ReplayArgs) {}

    public async Go() {
        if (this.args.inDirName === undefined) {
            return Promise.reject("Please provide --indir argument");
        }
        if (!fs.existsSync(this.args.inDirName)) {
            return Promise.reject("File does not exist");
        }

        this.storage = new PragueDumpReaderFileSnapshotWriter(this.args.inDirName, this.args.version);
        this.mainDocument = new Document(this.args, this.storage);
        await this.mainDocument.load(this.args.version);

        if (this.args.version !== undefined) {
            console.log(`Starting from ${this.args.version}, seq# = ${this.mainDocument.currentOp}`);
            if (this.mainDocument.currentOp > this.args.to) {
                console.log("Warning: --to argument is below snapshot starting op");
            }
        }

        // Load all snapshots from storage
        if (this.args.validateSotrageSnapshots) {
            for (const node of fs.readdirSync(this.args.inDirName, {withFileTypes: true})) {
                if (!node.isDirectory()) {
                    continue;
                }
                const storage = new PragueDumpReaderFileSnapshotWriter(this.args.inDirName, node.name);
                const doc = new Document(this.args, storage);
                await doc.load(node.name);
                doc.setFileName(`${doc.getFileName()}_storage_${node.name}`);

                if (this.args.from > doc.fromOp) {
                    console.log(`Skipping snapshots ${node.name} generated at op = ${doc.fromOp}`);
                } else {
                    console.log(`Loading snapshots ${node.name} generated at op = ${doc.fromOp}`);
                    this.documentsFromStorageSnapshots.push(doc);
                }
            }
            this.documentsFromStorageSnapshots.sort((a: Document, b: Document) => {
                return a.fromOp > b.fromOp ? 1 : -1;
            });
        }

        if (this.args.snapFreq !== Number.MAX_SAFE_INTEGER || this.args.validateSotrageSnapshots) {
            const storage = new PragueDumpReaderFileSnapshotWriter(this.args.inDirName, this.args.version);
            this.documentNeverSnapshot = new Document(this.args, storage);
            await this.documentNeverSnapshot.load(this.args.version);
            this.documentNeverSnapshot.setFileName(`snapshot_${this.documentNeverSnapshot.fromOp}_noSnapshots`);
        }

        let nextSnapPoint = this.args.from;

        if (this.args.verbose) {
            console.log("Starting");
        }

        while (true) {
            if (nextSnapPoint <= this.mainDocument.currentOp) {
                nextSnapPoint = this.mainDocument.currentOp + this.args.snapFreq;
            }
            let replayTo = Math.min(nextSnapPoint, this.args.to);

            if (this.documentsFromStorageSnapshots.length > 0) {
                const op = this.documentsFromStorageSnapshots[0].fromOp;
                replayTo = Math.min(replayTo, op);
            }

            await this.mainDocument.replay(replayTo);
            if (this.documentNeverSnapshot) {
                await this.documentNeverSnapshot.replay(replayTo);
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

        console.log("\nLast replayed op seq# ", this.mainDocument.currentOp);
        assert(this.documentsFromStorageSnapshots.length === 0);
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
            this.snapshots[op] = snapshot;
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
        await document2.load(`Saved & loaded at seq# ${op}`);
        await this.saveAndVerify(document2, dir, snapshotSaved, snapshotSavedString);

        // Add extra container
        if (!final && ((op - this.mainDocument.fromOp) % this.args.snapFreq) === 0) {
            const storage3 = new storageClass(snapshotSaved);
            const document3 = new Document(this.args, storage3);
            await document3.load(`Saved & loaded at seq# ${op}`);
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

        while (this.documentsFromStorageSnapshots.length > 0 && this.documentsFromStorageSnapshots[0].fromOp <= op) {
            const doc = this.documentsFromStorageSnapshots.shift();
            assert(doc.fromOp === op);
            const good = await this.saveAndVerify(doc, dir, snapshotSaved, snapshotSavedString);
            if (good) {
                console.log(`\nStorage snapshot at ${op} is good!`);
            }
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
                child_process.exec(`windiff.exe "${dir}/${name1}_expanded.json" "${dir}/${name2}_expanded.json"`);
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
