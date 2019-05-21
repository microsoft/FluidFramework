import * as API from "@prague/client-api";
import { IDocumentDeltaStorageService,
    IDocumentServiceFactory,
    IHost,
    IPragueResolvedUrl,
    IResolvedUrl } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { FileDocumentService, Replayer, ReplayFileDeltaConnection } from "@prague/file-socket-storage";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { generateToken } from "@prague/services-core";
import { Deferred } from "@prague/utils";
import { ReplayTool } from "./replayTool";

// tslint:disable-next-line:no-var-requires no-require-imports no-unsafe-any
const apiVersion = require("../package.json").version;

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

    const fileDocumentService: FileDocumentService =
// tslint:disable-next-line: prefer-type-cast
        await documentServiceFactory.createDocumentService(resolved) as FileDocumentService;
    const fileDeltaStorageService: IDocumentDeltaStorageService = fileDocumentService.fileDeltaStorage;
    console.log("Document Created !!");

    const replayer: Replayer = ReplayFileDeltaConnection.getReplayer();

    if (replayTool.from > replayer.currentReplayedOp) {
        await replayer.replay(replayTool.from);
        console.log("After from", replayer.currentReplayedOp);
    }

    let replayFrom = 0;
    let replayTo = -1;

    if (replayTool.snapFreq) {
        let opsCountToReplay: number;
        while (replayer.currentReplayedOp < replayTool.to) {
            opsCountToReplay = replayTool.snapFreq - (replayer.currentReplayedOp % replayTool.snapFreq);
            replayTo = Math.min(replayer.currentReplayedOp + opsCountToReplay, replayTool.to);
            await replayer.replay(replayTo);
            await delay(1000);
            await saveSnapshot(container, "save snapshot", fileDeltaStorageService, replayFrom, replayTo);
            replayFrom = replayTo;
        }
    } else if (replayTool.takeSnapshot) {
        await replayer.replay(replayTool.to);
        await delay(1000);
        await saveSnapshot(container, "save snapshot", fileDeltaStorageService, replayFrom, replayTo);
    }
}

function delay(ms: number) {
    // tslint:disable-next-line: no-string-based-set-timeout
        return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveSnapshot(
    container: Container,
    tagMessage: string,
    fileDeltaStorageService: IDocumentDeltaStorageService,
    replayFrom: number,
    replayTo: number): Promise<void> {
    if (container.parentBranch) {
        console.log(`Skipping snapshot due to being branch of ${container.parentBranch}`);
        return;
    }

    // Only snapshot once a code quorum has been established
    if (!container.getQuorum().has("code2")) {
        console.log(`Skipping snapshot due to no code quorum`);
        return;
    }

    // Stop inbound message processing while we complete the snapshot
    try {
        if (container.deltaManager !== undefined) {
            container.deltaManager.inbound.pause();
        }

        await container.snapshotCoreForReplayTool(tagMessage, fileDeltaStorageService, replayFrom, replayTo);

    } catch (ex) {
        console.log("Snapshot error", ex);
        throw ex;

    } finally {
        if (container.deltaManager !== undefined) {
            container.deltaManager.inbound.resume();
        }
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
    // For legacy purposes we currently fill in a default domain
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
