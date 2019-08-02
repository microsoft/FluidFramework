/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as API from "@prague/client-api";
import {
    ITelemetryBaseEvent,
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
    TreeEntry,
} from "@prague/protocol-definitions";
import {
    FileSnapshotReader,
    IFileSnapshot,
} from "@prague/replay-socket-storage";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { generateToken } from "@prague/services-core";
import * as assert from "assert";
import * as fs from "fs";
import { ReplayArgs } from "./replayTool";

// tslint:disable:non-literal-fs-path

/**
 * helper class holding container and providing load / snapshot capabilities
 */
class Document {
    private container: Container;
    private replayer: Replayer;
    private documentSeqNumber = 0;
    private from = -1;

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

    public async load() {
        const deltaStorageService = new FileDeltaStorageService(this.args.inDirName);
        const deltaConnection = await ReplayFileDeltaConnection.create(deltaStorageService);
        const documentServiceFactory = new FileDocumentServiceFactory(
            this.storage,
            deltaStorageService,
            deltaConnection);

        this.container = await this.loadContainer(
            documentServiceFactory,
            this.args.version);

        this.from = this.container.deltaManager.referenceSequenceNumber;
        this.replayer = deltaConnection.getReplayer();

        this.replayer.currentReplayedOp = this.from;

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

    public snapshot(message: string) {
        return this.container.snapshot(message, true /*generateFullTreeNoOtimizations*/);
    }

    // ITelemetryBaseLogger implementation
    public send(event: ITelemetryBaseEvent) {
        if (event.category === "error") {
            // Stack is not output properly (with newlines), if done as part of event
            const stack: string | undefined = event.stack as string | undefined;
            delete event.stack;
            console.error("An error has been logged!");
            console.error(event);
            if (stack) {
                console.error(stack);
            }
        }
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
        const loader = new Loader(host, serviceFactory, codeLoader, options, this);
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
    private mainDocument2?: Document;
    private readonly documents: Document[] = [];

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
        await this.mainDocument.load();
        console.log("Document Created !!");
        console.log("Starting with seq# ", this.mainDocument.currentOp);

        if (this.args.snapFreq) {
            this.mainDocument2 = new Document(this.args, this.storage);
            await this.mainDocument2.load();

            while (this.mainDocument.currentOp < this.args.to) {
                const replayTo = Math.min(
                    this.mainDocument.currentOp + this.args.snapFreq,
                    this.args.to);

                await this.mainDocument.replay(replayTo);
                await this.mainDocument2.replay(replayTo);
                for (const doc of this.documents) {
                    await doc.replay(replayTo);
                }

                // If we got less than asked, we run out of ops.
                const final = this.mainDocument.currentOp < replayTo;

                await this.generateSnapshot(final);

                if (final) {
                    break;
                }
            }
        } else {
            await this.mainDocument.replay(this.args.to);

            if (this.args.takeSnapshot) {
                await this.generateSnapshot(true);
            }
        }
        console.log("\nLast replayed op seq# ", this.mainDocument.currentOp);
    }

    private async generateSnapshot(final: boolean) {
        const op = this.mainDocument.currentOp;
        const dir = `${this.args.outDirName}/op_${op}`;
        let snapshotSaved: IFileSnapshot | undefined;
        let snapshotSavedString: string | undefined;

        if (this.args.createAllFiles) {
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
            if (this.args.createAllFiles) {
                fs.writeFileSync(
                    `${dir}/${this.snapshotFileName(this.mainDocument)}.json`,
                    snapshotSavedString,
                    { encoding: "utf-8" });
            }
        };

        if (this.args.verbose) {
            console.log(`Writing snapshot after OP number ${op}`);
        }
        const snapshotMessage = `Message:this.args Snapshot after op ${op}`;
        await this.mainDocument.snapshot(snapshotMessage);
        if (snapshotSaved === undefined) {
            console.error(`\nSnapshot was not saved for op # ${op}!`);
            return;
        }

        // Load it back to prove it's correct
        const storageClass = FileSnapshotWriterClassFactory(FileSnapshotReader);
        const storage2 = new storageClass(snapshotSaved);
        const document2 = new Document(this.args, storage2);
        await document2.load();
        await this.saveAndVerify(document2, dir, snapshotSaved, snapshotSavedString);

        // Add extra container
        if (!final) {
            const storage3 = new storageClass(snapshotSaved);
            const document3 = new Document(this.args, storage3);
            await document3.load();
            this.documents.push(document3);
        } else if (this.mainDocument2) {
            await this.saveAndVerify(this.mainDocument2, dir, snapshotSaved, snapshotSavedString);
        }

        if (final || this.mainDocument.fromOp + this.args.opsToSkip < op) {
            do {
                const doc = this.documents.shift();
                if (doc === undefined) {
                    break;
                }
                await this.saveAndVerify(doc, dir, snapshotSaved, snapshotSavedString);
            } while (final);
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

    private snapshotFileName(doc: Document) {
        return doc === this.mainDocument2 ?
            `snapshot_${doc.fromOp}_noSnapshots` :
            `snapshot_${doc.fromOp}`;
    }

    private async saveAndVerify(
            document2: Document,
            dir: string,
            snapshotSaved: IFileSnapshot,
            snapshotSavedString: string) {
        let snapshotSaved2: IFileSnapshot | undefined;
        let snapshotSaved2String: string | undefined;
        const op = document2.currentOp;

        assert(this.mainDocument.currentOp === op);

        const name1 = this.snapshotFileName(this.mainDocument);
        const name2 = this.snapshotFileName(document2);

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

        const snapshotMessage = `Message:this.args Snapshot after op ${op}, round-trip through load-save`;
        await document2.snapshot(snapshotMessage);
        if (snapshotSaved2String === undefined) {
            console.error(`\nSnapshot #2 was not saved at op # ${op}!`);
            return;
        }

        if (snapshotSavedString !== snapshotSaved2String) {
            // tslint:disable-next-line:max-line-length
            console.error(`\nOp ${op}: Discrepancy between ${name1} & ${name2}! Likely a bug in snapshot load-save sequence!`);
            fs.mkdirSync(dir, { recursive: true });

            this.expandForReadabilityAndWriteOut(snapshotSaved, `${dir}/${name1}`);
            this.expandForReadabilityAndWriteOut(snapshotSaved2, `${dir}/${name2}`);
        } else if (!this.args.verbose) {
            process.stdout.write(".");
        }
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
