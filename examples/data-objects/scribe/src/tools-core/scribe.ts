/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import childProcess from "child_process";
import path from "path";
import { ILoader } from "@fluidframework/container-definitions";
import { ISharedMap, SharedMap } from "@fluidframework/map";
import * as MergeTree from "@fluidframework/merge-tree";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISharedString } from "@fluidframework/sequence";
import * as author from "./author";

function setParagraphs(chunks: string[], sharedString: ISharedString) {
    let props;
    chunks.forEach((chunk, index) => {
        props = {
            [MergeTree.reservedMarkerIdKey]: [`p-${index}`],
            [MergeTree.reservedTileLabelsKey]: ["pg"],
        };
        sharedString.insertMarker(index, MergeTree.ReferenceType.Tile, props);
    });

    // Insert final pg marker. All text must be before a pg marker or it won't display!
    props = {
        [MergeTree.reservedMarkerIdKey]: ["p-final"],
        [MergeTree.reservedTileLabelsKey]: ["pg"],
    };
    sharedString.insertMarker(chunks.length, MergeTree.ReferenceType.Tile, props);
}

async function conductor(
    loader: ILoader,
    url: string,
    scribeMap: ISharedMap,
    runtime: IFluidDataStoreRuntime,
    text,
    intervalTime,
    writers,
    processes,
    callback,
): Promise<author.IScribeMetrics | undefined> {
    const process = 0;
    const docId = "";
    const chunks = author.normalizeText(text).split("\n");

    const sharedString = await author.requestSharedString(loader, url);

    const chunksMap = SharedMap.create(runtime);
    scribeMap.set("chunks", chunksMap.handle);

    setParagraphs(chunks, sharedString);

    chunks.forEach((chunk, index) => {
        const chunkKey = `p-${index}`;
        chunksMap.set(chunkKey, chunk);
    });

    if (processes === 1) {
        // eslint-disable-next-line no-return-await
        return await author.typeFile(
            loader,
            url,
            runtime,
            sharedString,
            chunksMap,
            text,
            intervalTime,
            writers,
            callback);
    }

    const interval = setInterval(() => {
        const args = [docId, intervalTime, chunks.length, process];
        childProcess.fork(`${__dirname + path.sep}author.js`, args);
        if (process >= processes) {
            clearInterval(interval);
        }
    }, 500);
}

export async function type(
    loader: ILoader,
    urlBase: string,
    scribeMap: ISharedMap,
    runtime: IFluidDataStoreRuntime,
    intervalTime: number,
    text: string,
    writers: number,
    processes: number,
    callback: author.ScribeMetricsCallback,
    distributed = false,
): Promise<author.IScribeMetrics | undefined> {
    if (distributed) {
        console.log("distributed");
    }

    return conductor(
        loader,
        urlBase,
        scribeMap,
        runtime,
        text,
        intervalTime,
        writers,
        processes,
        callback);
}

/**
 * Toggle between play and pause.
 */
export function togglePlay() {
    author.toggleAuthorPlay();
}
