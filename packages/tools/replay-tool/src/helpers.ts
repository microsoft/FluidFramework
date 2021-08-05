/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "assert";
import fs from "fs";
import { Container, Loader } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
    IDocumentServiceFactory,
    IFluidResolvedUrl,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { IFileSnapshot } from "@fluidframework/replay-driver";
import { TelemetryLogger } from "@fluidframework/telemetry-utils";
import { getNormalizedSnapshot } from "@fluidframework/tool-utils";
import { ReplayDataStoreFactory, ReplayRuntimeFactory } from "./replayFluidFactories";
import { ReplayCodeLoader, ReplayUrlResolver } from "./replayLoaderObject";
import { mixinDataStoreWithAnyChannel } from "./unknownChannel";

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

export async function loadContainer(
    documentServiceFactory: IDocumentServiceFactory,
    documentName: string,
    logger?: TelemetryLogger,
): Promise<Container> {
    const resolved: IFluidResolvedUrl = {
        endpoints: {
            deltaStorageUrl: "example.com",
            ordererUrl: "example.com",
            storageUrl: "example.com",
        },
        id: documentName,
        tokens: {},
        type: "fluid",
        url: `fluid-file://localhost:6000/fluid/${documentName}`,
    };
    const urlResolver = new ReplayUrlResolver(
        new Map<string, IResolvedUrl>([[resolved.url, resolved]]),
    );

    const dataStoreFactory = new ReplayDataStoreFactory(mixinDataStoreWithAnyChannel());
    // List of data store registries in container runtime.
    const dataStoreRegistries = new Map([
        ["_scheduler", Promise.resolve(dataStoreFactory)],
        ["@ms/atmentions", Promise.resolve(dataStoreFactory)],
        ["@ms/augloop", Promise.resolve(dataStoreFactory)],
        ["@ms/catalog", Promise.resolve(dataStoreFactory)],
        ["@ms/scriptor", Promise.resolve(dataStoreFactory)],
        ["@ms/discover", Promise.resolve(dataStoreFactory)],
        ["@ms/registro", Promise.resolve(dataStoreFactory)],
        ["@ms/formula", Promise.resolve(dataStoreFactory)],
        ["@ms/application-services", Promise.resolve(dataStoreFactory)],
        ["@ms/undo-stack", Promise.resolve(dataStoreFactory)],
        ["@ms/commanding-surface", Promise.resolve(dataStoreFactory)],
        ["@ms/dias", Promise.resolve(dataStoreFactory)],
        ["@ms/scriptor/Titulo", Promise.resolve(dataStoreFactory)],
        ["@fluidx/tasks", Promise.resolve(dataStoreFactory)],
        ["@ms/tablero/TableroView", Promise.resolve(dataStoreFactory)],
        ["@ms/tablero/TableroDocument", Promise.resolve(dataStoreFactory)],
        ["@fluid-example/table-document/TableDocument", Promise.resolve(dataStoreFactory)],
        ["LastEditedComponent", Promise.resolve(dataStoreFactory)],
        ["OfficeRootComponent", Promise.resolve(dataStoreFactory)],
        ["OneNoteRootComponentType", Promise.resolve(dataStoreFactory)],
    ]);

    // Older snapshots may not contain summary acks, so the summarizer will throw error in case it faces more
    // ops than "maxOpsSinceLastSummary". So set it to a higher number to suppress those errors and run tests.
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { generateSummaries: false, maxOpsSinceLastSummary: 100000 },
    };
    const codeLoader = new ReplayCodeLoader(new ReplayRuntimeFactory(runtimeOptions, dataStoreRegistries));

    // Load the Fluid document
    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
        options: {},
        logger,
    });

    return loader.resolve({ url: resolved.url });
}
