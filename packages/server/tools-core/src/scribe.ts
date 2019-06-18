import * as api from "@prague/client-api";
import { ISharedMap } from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import * as Sequence from "@prague/sequence";
import * as childProcess from "child_process";
import * as path from "path";
import * as author from "./author";

let document: api.Document;
let sharedString: Sequence.SharedString;

function setParagraphs(chunks: string[]) {
    let props;
    for (let c = 0; c < chunks.length; c++) {
        props = {
            [MergeTree.reservedMarkerIdKey]: ["p-" + c],
            [MergeTree.reservedTileLabelsKey]: ["pg"],
        };
        sharedString.insertMarker(c, MergeTree.ReferenceType.Tile, props);
    }

    // Insert final pg marker. All text must be before a pg marker or it won't display!
    props = {
        [MergeTree.reservedMarkerIdKey]: ["p-final"],
        [MergeTree.reservedTileLabelsKey]: ["pg"],
    };
    sharedString.insertMarker(chunks.length, MergeTree.ReferenceType.Tile, props);
}

function getParagraphs() {
    const root = document.getRoot();
    const chunksMap = root.get("chunks");
    if (chunksMap) {
        for (const key of chunksMap.keys()) {
            console.log(key + ": " + chunksMap.get(key));
        }
    }
}

async function setChunkMap(chunks: string[]) {
    let c = 0;
    const root = await document.getRoot();
    const chunkMap = root.get("chunks") as ISharedMap;

    if (chunks) {
        for (const chunk of chunks) {
            const chunkKey = "p-" + c;
            if (chunk !== "") {
                chunkMap.set(chunkKey, chunk);
            }
            c++;
        }
    }
}

async function conductor(
    urlBase: string,
    resolver: ContainerUrlResolver,
    text,
    intervalTime,
    writers,
    processes,
    callback): Promise<author.IScribeMetrics> {

    const process = 0;
    const docId = "";
    const chunks = author.normalizeText(text).split("\n");

    if (processes === 1) {
        return await author.typeFile2(
            urlBase,
            document,
            resolver,
            sharedString,
            text,
            intervalTime,
            writers,
            callback);
    }

    const interval = setInterval(() => {
        const args = [docId, intervalTime, chunks.length, process];
        childProcess.fork(__dirname + path.sep + "author.js", args);
        if (process >= processes) {
            clearInterval(interval);
        }
    }, 500);
}

export async function create(
    urlBase: string,
    id: string,
    resolver: ContainerUrlResolver,
    text: string,
    debug = false): Promise<void> {

    document = await api.load(`${urlBase}/${id}`, { resolver }, {});
    const root = await document.getRoot();

    root.set("users", document.createMap());
    sharedString = document.createString() as Sequence.SharedString;
    root.set("calendar", undefined, Sequence.SharedIntervalCollectionValueType.Name);
    const seq = Sequence.SharedNumberSequence.create(document.runtime);
    root.set("sequence-test", seq);

    // p-start might break something
    sharedString.insertMarker(0, MergeTree.ReferenceType.Tile, { [MergeTree.reservedTileLabelsKey]: ["pg"] });
    root.set("text", sharedString);
    root.set("ink", document.createMap());

    await root.set("chunks", document.createMap());

    const chunks = author.normalizeText(text).split("\n");
    setParagraphs(chunks);
    await setChunkMap(chunks);
    if (debug) {
        getParagraphs();
    }

    return Promise.resolve();
}

export async function type(
    urlBase: string,
    intervalTime: number,
    text: string,
    writers: number,
    processes: number,
    resolver: ContainerUrlResolver,
    callback: author.ScribeMetricsCallback,
    distributed = false): Promise<author.IScribeMetrics> {

    if (distributed) {
        console.log("distributed");
    }
    return conductor(
        urlBase,
        resolver,
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
