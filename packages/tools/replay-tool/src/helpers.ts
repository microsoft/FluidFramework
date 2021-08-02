/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "assert";
import fs from "fs";
import * as API from "@fluid-internal/client-api";
import { Container, Loader } from "@fluidframework/container-loader";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "@fluidframework/datastore";
import {
    IFluidDataStoreRuntime,
    IChannelFactory,
    IChannelAttributes,
    IChannelServices,
    IChannel,
} from "@fluidframework/datastore-definitions";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, SummaryType } from "@fluidframework/protocol-definitions";
import { IFileSnapshot } from "@fluidframework/replay-driver";
import {
    IFluidDataStoreContext,
    IGarbageCollectionData,
    IChannelSummarizeResult,
} from "@fluidframework/runtime-definitions";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";
import { getNormalizedSnapshot } from "@fluidframework/tool-utils";

/**
 * Helper function that normalizes the snapshot trees in the given file snapshot.
 * @returns the normalized file snapshot.
 */
export function getNormalizedFileSnapshot(snapshot: IFileSnapshot): IFileSnapshot {
    const normalizedSnapshot: IFileSnapshot = {
        commits: {},
        tree: getNormalizedSnapshot(snapshot.tree),
    };
    for (const commit of Object.keys(snapshot.commits)) {
        normalizedSnapshot.commits[commit] = getNormalizedSnapshot(snapshot.commits[commit]);
    }
    return normalizedSnapshot;
}

export function compareWithReferenceSnapshot(
    snapshot: IFileSnapshot,
    referenceSnapshotFilename: string,
    errorHandler: (desciption: string, error?: any) => void,
) {
    // Read the reference snapshot and covert it to normalized IFileSnapshot.
    const referenceSnapshotString = fs.readFileSync(`${referenceSnapshotFilename}.json`, "utf-8");
    const referenceSnapshot = getNormalizedFileSnapshot(JSON.parse(referenceSnapshotString));

    /**
     * The packageVersion of the snapshot could be different from the reference snapshot. Replace all package
     * package versions with X before we compare them. This is how it will looks like:
     * Before replace - "{\"type\":\"https://graph.microsoft.com/types/map\",\"packageVersion\":\"0.28.0-214\"}"
     * After replace  - "{\"type\":\"https://graph.microsoft.com/types/map\",\"packageVersion\":\"X\"}"
     */
    const packageVersionRegex = /\\"packageversion\\":\\"[^"]+\\"/gi;
    const packageVersionPlaceholder = "\\\"packageVersion\\\":\\\"X\\\"";

    const normalizedSnapshot = JSON.parse(
        JSON.stringify(snapshot, undefined, 2).replace(packageVersionRegex, packageVersionPlaceholder),
    );
    const normalizedReferenceSnapshot = JSON.parse(
        JSON.stringify(referenceSnapshot, undefined, 2).replace(packageVersionRegex, packageVersionPlaceholder),
    );

    // Put the assert in a try catch block, so that we can report errors, if any.
    try {
        strict.deepStrictEqual(normalizedSnapshot, normalizedReferenceSnapshot);
    } catch (error) {
        errorHandler(`Mismatch in snapshot ${referenceSnapshotFilename}.json`, error);
    }
}

class UnknownChannel implements IChannel {
    constructor(
        public readonly id: string,
        public readonly attributes: IChannelAttributes,
        services: IChannelServices)
    {
        services.deltaConnection.attach({
            process: (message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) => {
            },
            setConnectionState: (connected: boolean) => {
            },
            reSubmit: (content: any, localOpMetadata: unknown) => {
            },
            applyStashedOp: (content: any) => {
            },
        });
    }

    get IFluidLoadable() { return this; }
    get handle(): IFluidHandle {
        throw new Error("not implemented");
    }

    public summarize(fullTree?: boolean, trackState?: boolean): IChannelSummarizeResult {
        return {
            gcData: { gcNodes: {} },
            stats: {
                treeNodeCount: 0,
                blobNodeCount: 0,
                handleNodeCount: 0,
                totalBlobSize: 0,
                unreferencedBlobSize: 0,
            },
            summary: {
                type: SummaryType.Tree,
                tree: { },
            },
        };
    }

    public isAttached() { return true; }

    public connect(services: IChannelServices): void {}

    public getGCData(): IGarbageCollectionData {
        return { gcNodes: {} };
    }
}

class UnknownChannelFactory implements IChannelFactory {
    readonly type = "Unknown DDS";
    readonly attributes: IChannelAttributes = {
        type: "Unknown DDS",
        snapshotFormatVersion: "1.0",
        packageVersion: "1.0",
    };

    async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        channelAttributes: Readonly<IChannelAttributes>,
    ): Promise<IChannel> {
        return new UnknownChannel(id, channelAttributes, services);
    }

    create(runtime: IFluidDataStoreRuntime, id: string): IChannel {
        throw new Error("Not implemented");
    }
}

class ObjectRegistryWithUnknownChannels implements ISharedObjectRegistry {
    private static readonly types = new Set<string>();

    constructor(private readonly base: ISharedObjectRegistry) {}
    public get(name: string): IChannelFactory | undefined {
        const res = this.base.get(name);
        if (res) {
            return res;
        }
        if (!ObjectRegistryWithUnknownChannels.types.has(name)) {
            ObjectRegistryWithUnknownChannels.types.add(name);
            console.error(`DDS of type ${name} can't be created`);
        }
        return new UnknownChannelFactory();
    }
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function mixinDataStoreWithAnyChannel(
    Base: typeof FluidDataStoreRuntime = FluidDataStoreRuntime)
{
    return class RuntimeWithRequestHandler extends Base {
        constructor(
            dataStoreContext: IFluidDataStoreContext,
            sharedObjectRegistry: ISharedObjectRegistry,
        ) {
            super(dataStoreContext, new ObjectRegistryWithUnknownChannels(sharedObjectRegistry));
        }
    } as typeof FluidDataStoreRuntime;
}

/**
 * URL Resolver object
 */
class ContainerUrlResolver implements IUrlResolver {
    constructor(private readonly cache?: Map<string, IResolvedUrl>) {
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        if (!this.cache.has(request.url)) {
            return Promise.reject(new Error(`ContainerUrlResolver can't resolve ${request}`));
        }
        return this.cache.get(request.url);
    }

    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
    ): Promise<string> {
        throw new Error("Not implemented");
    }
}

export const resolveUrl = (documentName: string): IFluidResolvedUrl => ({
    endpoints: {
        deltaStorageUrl: "example.com",
        ordererUrl: "example.com",
        storageUrl: "example.com",
    },
    id: documentName,
    tokens: {},
    type: "fluid",
    url: `fluid-file://localhost:6000/fluid/${documentName}`,
});

function getLoader(
    documentServiceFactory: IDocumentServiceFactory,
    documentName: string,
    logger?: TelemetryLogger,
): Loader {
    const resolvedUrl = resolveUrl(documentName);
    const urlResolver = new ContainerUrlResolver(
        new Map<string, IResolvedUrl>([[resolvedUrl.url, resolvedUrl]]));
    const chaincode = new API.Chaincode(
        () => { throw new Error("Can't close Document"); },
        mixinDataStoreWithAnyChannel());
    // Older snapshots may not contain summary acks, so the summarizer will throw error in case it faces more
    // ops than "maxOpsSinceLastSummary". So set it to a higher number to suppress those errors and run tests.
    const codeLoader = new API.CodeLoader({
        summaryOptions: { generateSummaries: false, maxOpsSinceLastSummary: 100000 }},
        [
            ["_scheduler", Promise.resolve(chaincode)],
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
            ["@ms/scriptor/Titulo", Promise.resolve(chaincode)],
            ["@fluidx/tasks", Promise.resolve(chaincode)],
            ["@ms/tablero/TableroView", Promise.resolve(chaincode)],
            ["@ms/tablero/TableroDocument", Promise.resolve(chaincode)],
            ["@fluid-example/table-document/TableDocument", Promise.resolve(chaincode)],
            ["LastEditedComponent", Promise.resolve(chaincode)],
            ["OfficeRootComponent", Promise.resolve(chaincode)],
            ["OneNoteRootComponentType", Promise.resolve(chaincode)],
        ]);

    // Make sure any package (string[]) is resolved as well.
    (chaincode as any).IFluidDataStoreRegistry = chaincode;
    (chaincode as any).get = async () => Promise.resolve(chaincode);

    const options = {};

    return new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
        options,
        logger,
    });
}

export async function createContainer(
    documentServiceFactory: IDocumentServiceFactory,
    documentName: string,
    logger?: TelemetryLogger,
): Promise<Container> {
    const loader = getLoader(
        documentServiceFactory,
        documentName,
        logger,
    );

    const container = await loader.createDetachedContainer({
        package: "no-dynamic-package",
        config: {},
    });
    await container.attach({ url: resolveUrl(documentName).url });
    return container;
}

export const loadContainer = async (
    documentServiceFactory: IDocumentServiceFactory,
    documentName: string,
    logger?: TelemetryLogger,
): Promise<Container> => getLoader(
        documentServiceFactory,
        documentName,
        logger,
    ).resolve({ url: resolveUrl(documentName).url });
