/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import childProcess from "child_process";
import path from "path";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { ILoader } from "@microsoft/fluid-container-definitions";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import MergeTree from "@microsoft/fluid-merge-tree";
import { IComponentRuntime } from "@microsoft/fluid-component-runtime-definitions";
import { ISharedString } from "@microsoft/fluid-sequence";
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
    runtime: IComponentRuntime,
    text,
    intervalTime,
    writers,
    processes,
    callback,
): Promise<author.IScribeMetrics> {
    const process = 0;
    const docId = "";
    const chunks = author.normalizeText(text).split("\n");

    const response = await loader.request({ url });
    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        return Promise.reject("Invalid document");
    }

    const component = response.value as IComponent;
    if (!component.ISharedString) {
        return Promise.reject("Cannot type into document");
    }

    const chunksMap = SharedMap.create(runtime);
    scribeMap.set("chunks", chunksMap.handle);

    setParagraphs(chunks, component.ISharedString);

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
            component.ISharedString,
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
    runtime: IComponentRuntime,
    intervalTime: number,
    text: string,
    writers: number,
    processes: number,
    callback: author.ScribeMetricsCallback,
    distributed = false,
): Promise<author.IScribeMetrics> {
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
