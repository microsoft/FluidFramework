/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as API from "@prague/client-api";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
    ITree,
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
    StaticStorageDocumentServiceFactory,
} from "@prague/replay-socket-storage";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { generateToken } from "@prague/services-core";
import * as assert from "assert";
import * as fs from "fs";
import { ReplayTool } from "./replayTool";

// tslint:disable:non-literal-fs-path

/**
 * This api will make calls to replay ops and take snapshots according to user input.
 *
 * @param replayTool - Replay tool object.
 * @param documentServiceFactory - Document service to be used as source for ops/snapshots.
 */
export async function playMessagesFromFileStorage(replayTool: ReplayTool) {
    if (!fs.existsSync(replayTool.inDirName)) {
        return Promise.reject("File does not exist");
    }
    const storage = new PragueDumpReaderFileSnapshotWriter(replayTool.inDirName, replayTool.version);
    const fileDeltaStorageService = new FileDeltaStorageService(replayTool.inDirName);
    const documentServiceFactory = new FileDocumentServiceFactory(storage, fileDeltaStorageService);

    const container = await load(
        documentServiceFactory,
        replayTool.version);
    console.log("Document Created !!");

    const replayer: Replayer = ReplayFileDeltaConnection.getReplayer();

    replayer.currentReplayedOp = container.deltaManager.referenceSequenceNumber;

    console.log("Starting with seq# ", replayer.currentReplayedOp);

    if (replayTool.snapFreq) {
        while (replayer.currentReplayedOp < replayTool.to) {
            const replayTo = Math.min(replayer.currentReplayedOp + replayTool.snapFreq, replayTool.to);
            await replayer.replay(replayTo);
            await isOpsProcessingDone(container, replayer);

            await generateSnapshot(
                container,
                storage,
                replayer.currentReplayedOp,
                replayTool.outDirName);

            // If we got less than asked, we run out of ops.
            if (replayer.currentReplayedOp < replayTo) {
                break;
            }
        }
    } else {
        await replayer.replay(replayTool.to);
        await isOpsProcessingDone(container, replayer);
        if (replayTool.takeSnapshot) {
            await generateSnapshot(container, storage, replayer.currentReplayedOp, replayTool.outDirName);
        }
    }
    console.log("Last replayed op seq# ", replayer.currentReplayedOp);
}

async function generateSnapshot(
        container: Container,
        storage: ISnapshotWriterStorage,
        op: number,
        outputDir: string) {
    const dir = `${outputDir}/op_${op}`;
    let snapshotSaved: IFileSnapshot | undefined;
    let snapshotSavedString: string | undefined;
    let snapshotSaved2String: string | undefined;

    fs.mkdirSync(dir, { recursive: true });

    storage.onCommitHandler = (componentName: string, tree: ITree) => {
        const filename = componentName.replace("/", "_");
        fs.writeFileSync(
            `${dir}/${filename}.json`,
            JSON.stringify(tree, undefined, 2),
            {encoding: "utf-8"});
    };

    storage.onSnapshotHandler = (snapshot: IFileSnapshot) => {
        snapshotSaved = snapshot;
        snapshotSavedString = JSON.stringify(snapshot, undefined, 2);
        fs.writeFileSync(
            `${dir}/snapshot.json`,
            snapshotSavedString,
            { encoding: "utf-8" });
    };

    let snapshotMessage = `Message:ReplayTool Snapshot after op ${op}`;
    console.log(`Writing snapshot after OP number ${op}`);
    await container.snapshot(snapshotMessage, true /*generateFullTreeNoOtimizations*/);
    if (snapshotSaved === undefined) {
        console.error("Snapshot was not saved!");
        return;
    }

    // Load it back to prove it's correct
    const storageClass = FileSnapshotWriterClassFactory(FileSnapshotReader);
    const storage2 = new storageClass(snapshotSaved);
    // new FileDeltaStorageService(replayTool.path)
    const container2 = await load(new StaticStorageDocumentServiceFactory(storage2));

    storage2.onCommitHandler = (componentName: string, tree: ITree) => {};
    storage2.onSnapshotHandler = (snapshot: IFileSnapshot) => {
        snapshotSaved2String = JSON.stringify(snapshot, undefined, 2);
        fs.writeFileSync(
            `${dir}/snapshot_2.json`,
            snapshotSaved2String,
            { encoding: "utf-8" });
    };

    snapshotMessage = `Message:ReplayTool Snapshot after op ${op}, round-trip through load-save`;
    await container2.snapshot(snapshotMessage, true /*generateFullTreeNoOtimizations*/);
    if (snapshotSaved2String === undefined) {
        console.error("Snapshot #2 was not saved!");
        return;
    }

    if (snapshotSavedString !== snapshotSaved2String) {
        // tslint:disable-next-line:max-line-length
        console.error(`Discrepancy between snapshot.json & snapshot_2.json! Likely a bug in snapshot load-save sequence!`);
    }

    // Follow up:
    // Summary needs commits (same way as snapshot), that is available in PragueDumpReaderFileSnapshotWriter.write()
    const summaryTree = await container.summarize(true /*generateFullTreeNoOtimizations*/);
    const file = `${dir}/summary.json`;
    fs.writeFileSync(file, JSON.stringify(summaryTree, undefined, 2));
}

function delay(ms: number) {
    // tslint:disable-next-line: no-string-based-set-timeout
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isOpsProcessingDone(container: Container, replayer: Replayer) {
    while (container.deltaManager && container.deltaManager.referenceSequenceNumber < replayer.currentReplayedOp) {
        await delay(10);
    }
}

async function load(
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

    const codeLoader = new API.CodeLoader(
        async (r, c) => {},
        { generateSummaries: false });

    const options: object = {
        blockUpdateMarkers: true,
        generateFullTreeNoOptimizations: true,
    };

    // Load the Fluid document
    const loader = new Loader(host, serviceFactory, codeLoader, options);
    const container: Container = await loader.resolve({ url: resolved.url });

    assert(container.existing); // ReplayFileDeltaConnection.create() guarantees that

    return container;
}
