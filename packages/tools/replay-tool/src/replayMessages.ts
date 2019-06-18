/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as API from "@prague/client-api";
import { IDocumentServiceFactory,
    IHost,
    IPragueResolvedUrl,
    IResolvedUrl } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { Replayer, ReplayFileDeltaConnection } from "@prague/file-socket-storage";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { generateToken } from "@prague/services-core";
import { Deferred } from "@prague/utils";
import { ReplayTool } from "./replayTool";

// tslint:disable-next-line:no-var-requires no-require-imports no-unsafe-any
const apiVersion = require("../package.json").version;

/**
 * This api will make calls to replay ops and take snapshots according to user input.
 *
 * @param replayTool - Replay tool object.
 * @param documentServiceFactory - Document service to be used as source for ops/snapshots.
 */
export async function playMessagesFromFileStorage(
    replayTool: ReplayTool,
    documentServiceFactory: IDocumentServiceFactory) {
    const resolved: IPragueResolvedUrl = {
        endpoints: {
            deltaStorageUrl: "replay.com",
            ordererUrl: "replay.com",
            storageUrl: "replay.com",
        },
        tokens: { jwt: generateToken("prague", "replay-tool", "replay-tool") },
        type: "prague",
        url: "prague://localhost:6000/prague/replay-tool",
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

    let replayTo = -1;

    replayer.currentReplayedOp = container.deltaManager.referenceSequenceNumber;
    console.log("last replayed op = ", replayer.currentReplayedOp);
    let snapshotMessage =
        `Message:ReplayTool Snapshot;OutputDirectoryName:${replayTool.outDirName ? replayTool.outDirName : "output"}`;
    if (replayTool.snapFreq) {
        let opsCountToReplay: number;
        while (replayer.currentReplayedOp < replayTool.to) {
            opsCountToReplay = replayTool.snapFreq - (replayer.currentReplayedOp % replayTool.snapFreq);
            replayTo = Math.min(replayer.currentReplayedOp + opsCountToReplay, replayTool.to);
            await replayer.replay(replayTo);
            await isOpsProcessingDone(container);
            snapshotMessage += `;OP:${replayer.currentReplayedOp}`;
            await container.snapshot(snapshotMessage);
            if (replayer.currentReplayedOp < replayTo) {
                break;
            }
        }
    } else if (replayTool.takeSnapshot) {
        await replayer.replay(replayTool.to);
    }
    await isOpsProcessingDone(container);
    snapshotMessage += `;OP:${replayer.currentReplayedOp}`;
    await container.snapshot(snapshotMessage);
}

function delay(ms: number) {
    // tslint:disable-next-line: no-string-based-set-timeout
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isOpsProcessingDone(container: Container) {
    while (container.deltaManager && container.deltaManager.inbound.length > 0) {
        await delay(10);
        continue;
    }
}

async function load(
    url: string,
    host: IHost,
    options: any = {},
    serviceFactory: IDocumentServiceFactory): Promise<Container> {

    const runDeferred = new Deferred<{ runtime: IComponentRuntime; context: IComponentContext }>();

    const codeLoader = new API.CodeLoader(
        async (r, c) => {
            runDeferred.resolve({ runtime: r, context: c });
            return null;
        });

    // Load the Prague document
    const loader = new Loader(host, serviceFactory, codeLoader, options);
    const container: Container = await loader.resolve({ url });

    if (!container.existing) {
        console.log("Container did not existed");
        initializeChaincode(container, `@prague/client-api@${apiVersion}`)
            .catch((error) => {
                console.log("chaincode error", error);
            });
    }

    // Wait for loader to start us
    await runDeferred.promise;

    return container;
}

async function initializeChaincode(container: Container, pkg: string): Promise<void> {
    const quorum = container.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!container.connected) {
        // tslint:disable-next-line
        await new Promise<void>((resolve) => container.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }

    console.log(`Code is ${quorum.get("code2")}`);
}
