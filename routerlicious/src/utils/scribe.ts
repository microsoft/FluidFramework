import * as childProcess from "child_process";
import * as path from "path";
import { api, MergeTree, types } from "../client-api";
import * as author from "./author";

let document: api.Document;
let sharedString: MergeTree.SharedString;

function setParagraphs(chunks: string[]) {
    for (let p = 0; p < chunks.length; p++) {
        let props = {
            [MergeTree.reservedMarkerIdKey]: ["p-" + p],
            [MergeTree.reservedTileLabelsKey]: ["pg"],
        };
        sharedString.insertMarker(p, MergeTree.ReferenceType.Tile, props);
        p++;
    }

    // Insert final pg marker. All text must be before a pg marker or it won't display!
    let props = {
        [MergeTree.reservedMarkerIdKey]: ["p-final"],
        [MergeTree.reservedTileLabelsKey]: ["pg"],
    };
    sharedString.insertMarker(chunks.length, MergeTree.ReferenceType.Tile, props);
}

function getParagraphs() {
    document.getRoot().getView()
        .then((root) => {
            (root.get("chunks").getView() as Promise<types.IMapView>)
                .then((chunksMap) => {
                    for (let key of chunksMap.keys()) {
                        console.log(key + ": " + chunksMap.get(key));
                    }
                });
        })
        .catch((error) => console.log("No Chunks: " + error));
}

async function setChunkMap(chunks: string[]) {
    let p = 0;
    const root = await document.getRoot().getView();
    let chunkMap = root.get("chunks") as types.IMapView;

    for (let chunk of chunks) {
        let pid = "p-" + p;

        chunkMap.set(pid, chunk);

        p++;
    }
}

async function conductor(text, intervalTime, writers, processes, callback ): Promise<author.IScribeMetrics> {
    let process = 0;
    let docId = "";
    let chunks = author.normalizeText(text).split("\n");

    if (writers === 1 && processes === 1) {
        return author.typeFile(document, sharedString, text, intervalTime, callback);
    }

    let interval = setInterval(() => {
        let args = [docId, intervalTime, chunks.length, process];
        childProcess.fork(__dirname + path.sep + "author.js", args);
        if (process >= processes) {
            clearInterval(interval);
        }
    }, 500);
}

export async function create(id: string, text: string, debug = false): Promise<void> {
    // Load the shared string extension we will type into
    document = await api.load(id);
    const root = await document.getRoot().getView();

    root.set("presence", document.createMap());
    root.set("users", document.createMap());
    sharedString = document.createString() as MergeTree.SharedString;

    sharedString.insertMarker(0, MergeTree.ReferenceType.Tile, { [MergeTree.reservedTileLabelsKey]: ["pg"] });
    root.set("text", sharedString);

    await root.set("chunks", document.createMap());

    let chunks = author.normalizeText(text).split("\n");
    setParagraphs(chunks);
    await setChunkMap(chunks);
    if (debug) {
        getParagraphs();
    }

    return Promise.resolve();
}

export async function type(
    intervalTime: number,
    text: string,
    writers: number,
    processes: number,
    callback: author.ScribeMetricsCallback): Promise<author.IScribeMetrics> {

    return conductor(text, intervalTime, writers, processes, callback);
}

/**
 * Toggle between play and pause.
 */
export function togglePlay() {
    author.togglePlay();
}
