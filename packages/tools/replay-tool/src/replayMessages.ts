/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as child_process from "child_process";
import * as fs from "fs";
import * as API from "@fluid-internal/client-api";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@microsoft/fluid-common-definitions";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { ChildLogger, TelemetryLogger } from "@microsoft/fluid-common-utils";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@microsoft/fluid-driver-definitions";
import {
    FileDeltaStorageService,
    FileDocumentServiceFactory,
    FileSnapshotWriterClassFactory,
    FileStorageDocumentName,
    FluidFetchReaderFileSnapshotWriter,
    ISnapshotWriterStorage,
    Replayer,
    ReplayFileDeltaConnection,
} from "@microsoft/fluid-file-driver";
import {
    IBlob,
    ISequencedDocumentMessage,
    ITree,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import {
    FileSnapshotReader,
    IFileSnapshot,
} from "@microsoft/fluid-replay-driver";

// "worker_threads" does not resolve without --experimental-worker flag on command line
let threads = { isMainThread: true };
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    threads = require("worker_threads");
} catch (error) { }

import { ReplayArgs } from "./replayArgs";
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const packageJson = require("../package.json");

function expandTreeForReadability(tree: ITree): ITree {
    const newTree: ITree = { entries: [], id: undefined };
    for (const node of tree.entries) {
        const newNode = { ...node };
        if (node.type === TreeEntry[TreeEntry.Tree]) {
            newNode.value = expandTreeForReadability(node.value as ITree);
        }
        if (node.type === TreeEntry[TreeEntry.Blob]) {
            const blob = node.value as IBlob;
            try {
                newNode.value = {
                    contents: JSON.parse(blob.contents) as string,
                    encoding: blob.encoding,
                };
            } catch (e) { }
        }
        newTree.entries.push(newNode);
    }
    return newTree;
}

/**
 * Helper class to container information about particular snapshot
 */
class ContainerContent {
    public snapshot?: IFileSnapshot;

    private snapshotSavedString?: string;
    private snapshotExpandedString?: string;

    public constructor(public readonly op: number) {
    }

    get snapshotAsString(): string {
        if (this.snapshotSavedString === undefined) {
            this.snapshotSavedString = JSON.stringify(this.snapshot, undefined, 2);
        }
        return this.snapshotSavedString;
    }

    get snapshotExpanded(): string {
        if (this.snapshotExpandedString === undefined) {
            const snapshotExpanded: IFileSnapshot = {
                commits: {},
                tree: expandTreeForReadability(this.snapshot.tree),
            };
            for (const commit of Object.keys(this.snapshot.commits)) {
                snapshotExpanded.commits[commit] = expandTreeForReadability(this.snapshot.commits[commit]);
            }

            this.snapshotExpandedString = JSON.stringify(snapshotExpanded, undefined, 2);
        }
        return this.snapshotExpandedString;
    }
}

function sameContent(content1: ContainerContent, content2: ContainerContent): boolean {
    assert(content1.op === content2.op);

    return content1.snapshotAsString === content2.snapshotAsString;
}

/**
 * Logger to catch errors in containers
 */
class Logger implements ITelemetryBaseLogger {
    public constructor(
        private readonly containerDescription: string,
        private readonly errorHandler: (event: ITelemetryBaseEvent) => boolean) {
    }

    // ITelemetryBaseLogger implementation
    public send(event: ITelemetryBaseEvent) {
        if (event.category === "error" && this.errorHandler(event)) {
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
 * URL Resolver object
 */
class ContainerUrlResolver implements IUrlResolver {
    constructor(private readonly cache?: Map<string, IResolvedUrl>) {
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        if (!this.cache.has(request.url)) {
            return Promise.reject(`ContainerUrlResolver can't resolve ${request}`);
        }
        return this.cache.get(request.url);
    }
}

/**
 * Helper class holding container and providing load / snapshot capabilities
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
        public readonly storage: ISnapshotWriterStorage,
        public readonly containerDescription: string) {
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
        return `snapshot_${this.currentOp}_${this.snapshotFileName}`;
    }

    public appendToFileName(suffix: string) {
        this.snapshotFileName = `${this.snapshotFileName}${suffix}`;
    }

    public async load(
        deltaStorageService: FileDeltaStorageService,
        errorHandler: (event: ITelemetryBaseEvent) => boolean) {
        const deltaConnection = await ReplayFileDeltaConnection.create(deltaStorageService);
        const documentServiceFactory = new FileDocumentServiceFactory(
            this.storage,
            deltaStorageService,
            deltaConnection);

        this.container = await this.loadContainer(
            documentServiceFactory,
            this.containerDescription,
            errorHandler);

        this.from = this.container.deltaManager.referenceSequenceNumber;
        this.replayer = deltaConnection.getReplayer();

        this.replayer.currentReplayedOp = this.from;

        this.snapshotFileName = `${this.fromOp}`;

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
            await new Promise((resolve) => {
                this.resolveC = resolve;
            });
            assert.equal(this.documentSeqNumber, this.currentOp);
        }
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public snapshot() {
        return this.container.snapshot(
            `ReplayTool Snapshot: op ${this.currentOp}, ${this.getFileName()}`,
            !this.args.incremental /*generateFullTreeNoOtimizations*/);
    }

    public extractContent(): ContainerContent {
        const content = new ContainerContent(this.currentOp);

        // Add here any interesting data extraction code that you want to use for comparison.
        // We can also write it out to disk, thus giving us an extra validation when
        // comparing changes "before" and "after", giving us view not just into internal data
        // representation, but also into observable impact to upper layers.
        // For example, it would be great to enumerate all shared strings and retrieve their text.

        return content;
    }

    public close() {
        this.container.close();
    }

    private resolveC = () => { };

    private async loadContainer(
        serviceFactory: IDocumentServiceFactory,
        containerDescription: string,
        errorHandler: (event: ITelemetryBaseEvent) => boolean,
    ): Promise<Container> {
        const resolved: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: "replay.com",
                ordererUrl: "replay.com",
                storageUrl: "replay.com",
            },
            tokens: {},
            type: "fluid",
            url: `fluid-file://localhost:6000/fluid/${FileStorageDocumentName}`,
        };

        const resolver = new ContainerUrlResolver(
            new Map<string, IResolvedUrl>([[resolved.url, resolved]]));
        const chaincode = new API.Chaincode(() => {
            throw new Error("Can't close Document");
        });
        const codeLoader = new API.CodeLoader({ generateSummaries: false },
            [
                ["@ms/atmentions", Promise.resolve(chaincode)],
                ["@ms/augloop", Promise.resolve(chaincode)],
                ["@ms/catalog", Promise.resolve(chaincode)],
                ["@ms/scriptor", Promise.resolve(chaincode)],
                ["@ms/discover", Promise.resolve(chaincode)],
                ["@ms/registro", Promise.resolve(chaincode)],
                ["@ms/formula", Promise.resolve(chaincode)],
                ["@ms/application-services", Promise.resolve(chaincode)],
                ["@ms/undo-stack", Promise.resolve(chaincode)],
                ["@ms/commanding-surface", Promise.resolve(chaincode)],
                ["@ms/dias", Promise.resolve(chaincode)],
            ]);
        const options = {};

        // Load the Fluid document
        this.docLogger = ChildLogger.create(new Logger(containerDescription, errorHandler));
        const loader = new Loader(
            resolver,
            serviceFactory,
            codeLoader,
            options, {},
            new Map<string, IProxyLoaderFactory>(),
            this.docLogger);
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
    private documentPriorWindow?: Document;
    private readonly documents: Document[] = [];
    private readonly documentsWindow: Document[] = [];
    private readonly documentsFromStorageSnapshots: Document[] = [];
    private windiffCount = 0;
    private deltaStorageService: FileDeltaStorageService;
    private errorCount = 0;

    public constructor(private readonly args: ReplayArgs) { }

    public async Go(): Promise<boolean> {
        this.args.checkArgs();

        // Make unhandled exceptions errors, not just warnings
        // Also report few of them!
        const listener = (up) => {
            this.reportError("UnhandledRejectionPromise", up);
        };
        process.on("unhandledRejection", listener);

        await this.setup();

        if (this.args.verbose) {
            console.log("Starting");
        }

        await this.mainCycle();

        if (this.args.verbose) {
            console.log("\nLast replayed op seq# ", this.mainDocument.currentOp);
        } else if (threads.isMainThread) {
            process.stdout.write("\n");
        }
        assert(this.documentsFromStorageSnapshots.length === 0);

        process.removeListener("unhandledRejection", listener);

        return this.errorCount === 0;
    }

    private shouldReportError() {
        // Report only first 5 errors
        this.errorCount++;
        const errorsToReport = 5;
        if (this.errorCount <= errorsToReport) {
            return true;
        }
        if (this.errorCount === errorsToReport + 1) {
            console.error("\n!!! Too many errors - stopped reporting errors !!!");
        }
        return false;
    }

    private reportError(description: string, error?: any) {
        if (this.shouldReportError()) {
            if (error === undefined) {
                console.error(description);
            } else if (error instanceof Error) {
                console.error(`${description}\n${error.stack}`);
            } else {
                console.error(`${description} ${error}`);
            }
        }
    }

    private errorHandler(event: ITelemetryBaseEvent): boolean {
        // Snapshots errors are both reported to telemetry and propagated to caller
        // So if we d not filter them out, we report them twice.
        // Avoid that, but have a safety net - increase error count, so that tool
        // still fails even if error is not propagated / reported properly.
        if (event.eventName === "fluid:telemetry:Container:SnapshotExceptionError") {
            if (this.errorCount === 0) {
                this.errorCount++;
            }
            return false;
        }
        return this.shouldReportError();
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private loadDoc(doc: Document) {
        return doc.load(
            this.deltaStorageService,
            (event) => this.errorHandler(event));
    }

    private async setup() {
        if (this.args.inDirName === undefined) {
            return Promise.reject("Please provide --indir argument");
        }
        if (!fs.existsSync(this.args.inDirName)) {
            return Promise.reject("File does not exist");
        }

        this.deltaStorageService = new FileDeltaStorageService(this.args.inDirName);

        this.storage = new FluidFetchReaderFileSnapshotWriter(this.args.inDirName, this.args.version);
        let description = this.args.version ? this.args.version : "main container";
        this.mainDocument = new Document(this.args, this.storage, description);
        await this.loadDoc(this.mainDocument);
        this.documents.push(this.mainDocument);
        if (this.args.from < this.mainDocument.fromOp) {
            this.args.from = this.mainDocument.fromOp;
        }

        if (this.args.version !== undefined) {
            console.log(`Starting from ${this.args.version}, seq# = ${this.mainDocument.currentOp}`);
            if (this.mainDocument.currentOp > this.args.to) {
                return Promise.reject("--to argument is below snapshot starting op. Nothing to do!");
            }
        }

        // This does not seem to provide much value, we can disable it for per reasons
        // It adds about 10% to the duration of the test.
        if (this.args.snapFreq !== Number.MAX_SAFE_INTEGER || this.args.validateStorageSnapshots) {
            const storage = new FluidFetchReaderFileSnapshotWriter(this.args.inDirName, this.args.version);
            description = this.args.version ? this.args.version : "secondary container";
            this.documentNeverSnapshot = new Document(this.args, storage, description);
            await this.loadDoc(
                this.documentNeverSnapshot);
            this.documentNeverSnapshot.appendToFileName("_noSnapshots");
            this.documents.push(this.documentNeverSnapshot);
        }

        // Load all snapshots from storage
        if (this.args.validateStorageSnapshots) {
            for (const node of fs.readdirSync(this.args.inDirName, { withFileTypes: true })) {
                if (!node.isDirectory()) {
                    continue;
                }
                // Did we load it already as main doc?
                if (node.name === this.args.version) {
                    continue;
                }

                const file = `${this.args.inDirName}/${node.name}/tree.json`;
                if (!fs.existsSync(file)) {
                    console.error(`${file} does not exist, skipping ${node.name} snapshot`);
                    continue;
                }

                const storage = new FluidFetchReaderFileSnapshotWriter(this.args.inDirName, node.name);
                const doc = new Document(this.args, storage, node.name);
                try {
                    await this.loadDoc(doc);
                    doc.appendToFileName(`_storage_${node.name}`);

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
            this.documentsFromStorageSnapshots.sort((a: Document, b: Document) => a.fromOp > b.fromOp ? 1 : -1);
        }
    }

    private async mainCycle() {
        let nextSnapPoint = this.args.from;

        // eslint-disable-next-line no-constant-condition
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
            for (const doc of this.documentsWindow) {
                await doc.replay(replayTo);
            }

            const final = this.mainDocument.currentOp < replayTo || this.args.to <= this.mainDocument.currentOp;
            await this.generateSnapshot(final);
            if (final) {
                break;
            }
        }
    }

    private async generateMainSnapshot(dir: string, final: boolean): Promise<ContainerContent> {
        const op = this.mainDocument.currentOp;

        const content = this.mainDocument.extractContent();

        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.storage.onSnapshotHandler = (snapshot: IFileSnapshot) => {
            content.snapshot = snapshot;
            if (this.args.compare) {
                this.compareSnapshots(
                    content,
                    `${dir}/${this.mainDocument.getFileName()}`);

            } else if (this.args.write) {
                fs.mkdirSync(dir, { recursive: true });
                this.expandForReadabilityAndWriteOut(
                    content,
                    `${dir}/${this.mainDocument.getFileName()}`);
            }
        };

        if (this.args.verbose) {
            if (this.args.write) {
                console.log(`Writing snapshot at seq# ${op}`);
            } else {
                console.log(`Validating snapshot at seq# ${op}`);
            }
        }

        await this.mainDocument.snapshot();
        if (final) {
            this.mainDocument.close();
        }

        return content;
    }

    private async validateSlidingSnapshots(
        content: ContainerContent,
        dir: string,
        final: boolean) {
        const op = content.op;

        // Add extra container
        if (!final && ((op - this.mainDocument.fromOp) % this.args.snapFreq) === 0) {
            const storageClass = FileSnapshotWriterClassFactory(FileSnapshotReader);
            const storage = new storageClass(content.snapshot);
            const document3 = new Document(this.args, storage, `Saved & loaded at seq# ${op}`);
            await this.loadDoc(document3);
            this.documentsWindow.push(document3);
        }

        const startOp = op - this.args.overlappingContainers * this.args.snapFreq;
        while (this.documentsWindow.length > 0
            && (final || this.documentsWindow[0].fromOp <= startOp)) {
            const doc = this.documentsWindow.shift();
            assert(doc.fromOp === startOp || final);
            await this.saveAndVerify(doc, dir, content, final);
        }
    }

    private async validateStorageSnapshots(content: ContainerContent, dir: string, final: boolean) {
        const op = content.op;

        const processVersionedSnapshot = this.documentsFromStorageSnapshots.length > 0 &&
            this.documentsFromStorageSnapshots[0].fromOp <= op;
        if (this.documentPriorSnapshot && (processVersionedSnapshot || final)) {
            await this.documentPriorSnapshot.replay(op);
            await this.saveAndVerify(this.documentPriorSnapshot, dir, content, final);
            this.documentPriorSnapshot = undefined;
        }
        if (processVersionedSnapshot) {
            this.documentPriorSnapshot = this.documentsFromStorageSnapshots.shift();
            assert(this.documentPriorSnapshot.fromOp === op);
            await this.saveAndVerify(this.documentPriorSnapshot, dir, content, final)
                .catch((e) => {
                    const from = this.documentPriorSnapshot.containerDescription;
                    this.reportError(`Error logged from ${from} while generating snapshot`, e);
                    this.documentPriorSnapshot = undefined;
                });
        }

    }

    private async validateSaveAndLoad(content: ContainerContent, dir: string, final: boolean) {
        const op = content.op;

        // Keep doc from previous iteration and validate here - this gives us shortest
        // distance between load & save, and finds bugs in tardis.
        // No need to do it if overlappingContainers === 1 - there is container like that
        // in validateSlidingSnapshots()!
        if (this.documentPriorWindow && this.args.overlappingContainers !== 1) {
            await this.documentPriorWindow.replay(op);
            await this.saveAndVerify(this.documentPriorWindow, dir, content, final);
            this.documentPriorWindow = undefined;
        }

        // Load it back to prove it's correct
        const storageClass = FileSnapshotWriterClassFactory(FileSnapshotReader);
        const storage = new storageClass(content.snapshot);
        this.documentPriorWindow = new Document(this.args, storage, `Saved & loaded at seq# ${op}`);
        await this.loadDoc(this.documentPriorWindow);
        await this.saveAndVerify(this.documentPriorWindow, dir, content, final);
    }

    private async generateSnapshot(final: boolean) {
        const op = this.mainDocument.currentOp;
        const dir = this.args.outDirName; // `${this.args.outDirName}/${op}`;

        const content = await this.generateMainSnapshot(dir, final);
        if (content.snapshot === undefined) {
            // Snapshots are not created if there is no "code" proposal
            // It takes some number of ops to get there (join, propose)
            // Do not report a failure if document is almost empty.
            if (op >= 4) {
                this.reportError(`\nSnapshot ${this.mainDocument.getFileName()} was not saved for op # ${op}!`);
            }
            return;
        }

        await this.validateSaveAndLoad(content, dir, final);

        await this.validateSlidingSnapshots(content, dir, final);

        if (final && this.documentNeverSnapshot) {
            await this.saveAndVerify(this.documentNeverSnapshot, dir, content, final);
        }

        await this.validateStorageSnapshots(content, dir, final);

        /*
        If (this.args.write) {
            // Follow up:
            // Summary needs commits (same way as snapshot), that is available in
            // FluidFetchReaderFileSnapshotWriter.write()
            const summaryTree = await container.summarize(true);
            const file = `${dir}/summary.json`;
            fs.writeFileSync(file, JSON.stringify(summaryTree, undefined, 2));
        }
        */
    }

    private async saveAndVerify(
        document2: Document,
        dir: string,
        content: ContainerContent,
        final: boolean): Promise<boolean> {
        const op = document2.currentOp;

        const content2 = document2.extractContent();

        const name1 = this.mainDocument.getFileName();
        const name2 = document2.getFileName();

        // eslint-disable-next-line @typescript-eslint/unbound-method
        document2.storage.onSnapshotHandler = (snapshot: IFileSnapshot) => {
            content2.snapshot = snapshot;
        };

        await document2.snapshot();
        if (final) {
            document2.close();
        }

        if (content2.snapshot === undefined) {
            this.reportError(`\nSnapshot ${name2} was not saved at op # ${op}!`);
            return false;
        }

        if (!sameContent(content, content2)) {
            // eslint-disable-next-line max-len
            this.reportError(`\nOp ${op}: Discrepancy between ${name1} & ${name2}! Likely a bug in snapshot load-save sequence!`);
            fs.mkdirSync(dir, { recursive: true });

            this.expandForReadabilityAndWriteOut(content, `${dir}/${name1}`);
            this.expandForReadabilityAndWriteOut(content2, `${dir}/${name2}`);

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

        if (!this.args.verbose && threads.isMainThread) {
            process.stdout.write(".");
        }
        return true;
    }

    private expandForReadabilityAndWriteOut(content: ContainerContent, filename: string) {
        fs.writeFileSync(
            `${filename}.json`,
            content.snapshotAsString,
            { encoding: "utf-8" });

        if (this.args.expandFiles) {
            fs.writeFileSync(
                `${filename}_expanded.json`,
                content.snapshotExpanded,
                { encoding: "utf-8" });
        }
    }

    private compareSnapshots(content: ContainerContent, filename: string) {
        const snapshotAsString = fs.readFileSync(
            `${filename}.json`,
            { encoding: "utf-8" });
        if (snapshotAsString.replace(new RegExp("0.12.0" , "g"), `${packageJson.version}`)
            !== content.snapshotAsString.replace(new RegExp("0.12.0" , "g"), `${packageJson.version}`)) {
            this.reportError(`Mismatch in snapshot ${filename}.json`);
        }
    }
}
