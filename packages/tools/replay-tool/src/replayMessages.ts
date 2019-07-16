/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as API from "@prague/client-api";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IHost,
    IResolvedUrl
} from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { FileStorageDocumentName, Replayer, ReplayFileDeltaConnection } from "@prague/file-socket-storage";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { generateToken } from "@prague/services-core";
import * as assert from "assert";
import * as fs from "fs";
import { ReplayTool } from "./replayTool";

// tslint:disable-next-line:no-var-requires no-require-imports no-unsafe-any

/**
 * This api will make calls to replay ops and take snapshots according to user input.
 *
 * @param replayTool - Replay tool object.
 * @param documentServiceFactory - Document service to be used as source for ops/snapshots.
 */
export async function playMessagesFromFileStorage(
    replayTool: ReplayTool,
    documentServiceFactory: IDocumentServiceFactory) {
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
    if (replayTool.version !== undefined) {
        resolved.url = `prague://localhost:6000/prague/${replayTool.version}`;
    }

    const resolver = new ContainerUrlResolver(
        "",
        "",
        new Map<string, IResolvedUrl>([[resolved.url, resolved]]));
    const apiHost = { resolver };

    const container = await load(
        resolved.url,
        apiHost,
        { blockUpdateMarkers: true },
        documentServiceFactory);
    console.log("Document Created !!");

    const replayer: Replayer = ReplayFileDeltaConnection.getReplayer();

    replayer.currentReplayedOp = container.deltaManager.referenceSequenceNumber;

    console.log("Starting with seq# ", replayer.currentReplayedOp);

    if (replayTool.snapFreq) {
        while (replayer.currentReplayedOp < replayTool.to) {
            const replayTo = Math.min(replayer.currentReplayedOp + replayTool.snapFreq, replayTool.to);
            await replayer.replay(replayTo);
            await isOpsProcessingDone(container, replayer);

            await generateSnapshot(container, replayer.currentReplayedOp, replayTool.outDirName);

            // If we got less than asked, we run out of ops.
            if (replayer.currentReplayedOp < replayTo) {
                break;
            }
        }
    } else {
        await replayer.replay(replayTool.to);
        await isOpsProcessingDone(container, replayer);
        if (replayTool.takeSnapshot) {
            await generateSnapshot(container, replayer.currentReplayedOp, replayTool.outDirName);
        }
    }
    console.log("Last replayed op seq# ", replayer.currentReplayedOp);
}

async function generateSnapshot(container: Container, op: number, outputDir: string) {
    // NOTE: This string is parsed by FileDocumentStorageService.write!
    const dir = `${outputDir}/op_${op}`;
    const snapshotMessage =
        `Message:ReplayTool Snapshot;OutputDirectoryName:${dir};OP:${op}`;
    await container.snapshot(snapshotMessage);

    // Follow up:
    // Summary needs commits (same way as snapshot), that is available in FileDocumentStorageService.write()
    const tree = await container.summarize();
    const file = `${dir}/summary.json`;
    // tslint:disable-next-line:non-literal-fs-path
    fs.writeFileSync(file, JSON.stringify(tree, undefined, 2));
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
    url: string,
    host: IHost,
    options: any = {},
    serviceFactory: IDocumentServiceFactory): Promise<Container> {

    const codeLoader = new API.CodeLoader(
        async (r, c) => {},
        { generateSummaries: false });

    // Load the Fluid document
    const loader = new Loader(host, serviceFactory, codeLoader, options);
    const container: Container = await loader.resolve({ url });

    assert(container.existing); // ReplayFileDeltaConnection.create() guarantees that

    return container;
}
