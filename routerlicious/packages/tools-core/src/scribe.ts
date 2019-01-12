import * as api from "@prague/client-api";
import { IMapView } from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import * as SharedString from "@prague/shared-string";
import * as socketStorage from "@prague/socket-storage";
import * as childProcess from "child_process";
import * as path from "path";
import * as author from "./author";

let document: api.Document;
let sharedString: SharedString.SharedString;

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
    document.getRoot().getView()
        .then((root) => {
            (root.get("chunks").getView() as Promise<IMapView>)
                .then((chunksMap) => {
                    for (const key of chunksMap.keys()) {
                        console.log(key + ": " + chunksMap.get(key));
                    }
                });
        })
        .catch((error) => console.log("No Chunks: " + error));
}

async function setChunkMap(chunks: string[]) {
    let c = 0;
    const root = await document.getRoot().getView();
    const chunkMap = root.get("chunks") as IMapView;

    for (const chunk of chunks) {
        const chunkKey = "p-" + c;
        if (chunk !== "" ) {
            chunkMap.set(chunkKey, chunk);
        }
        c++;
    }
}

async function conductor(
    text,
    intervalTime,
    writers,
    processes,
    documentToken: string,
    metricsToken: string,
    callback): Promise<author.IScribeMetrics> {

    const process = 0;
    const docId = "";
    const chunks = author.normalizeText(text).split("\n");

    if (processes === 1) {
        return await author.typeFile(
            document,
            sharedString,
            text,
            intervalTime,
            writers,
            documentToken,
            metricsToken,
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
    id: string,
    token: string,
    text: string,
    debug = false): Promise<void> {

    // Load the shared string extension we will type into
    const tokenService = new socketStorage.TokenService();
    const claims = tokenService.extractClaims(token);

    document = await api.load(id, claims.tenantId, claims.user, new socketStorage.TokenProvider(token), { });
    const root = await document.getRoot().getView();

    root.set("presence", document.createMap());
    root.set("users", document.createMap());
    sharedString = document.createString() as SharedString.SharedString;

    // p-start might break something
    sharedString.insertMarker(0, MergeTree.ReferenceType.Tile, {[MergeTree.reservedTileLabelsKey]: ["pg"] });
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
    intervalTime: number,
    text: string,
    writers: number,
    processes: number,
    documentToken: string,
    metricsToken: string,
    callback: author.ScribeMetricsCallback,
    distributed = false): Promise<author.IScribeMetrics> {

    if (distributed) {
        console.log("distributed");
    }
    return conductor(
        text,
        intervalTime,
        writers,
        processes,
        documentToken,
        metricsToken,
        callback);
}

/**
 * Toggle between play and pause.
 */
export function togglePlay() {
    author.toggleAuthorPlay();
}
