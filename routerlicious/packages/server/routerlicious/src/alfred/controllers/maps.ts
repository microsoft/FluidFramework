import * as agent from "@prague/agent";
import { SharedObject } from "@prague/api-definitions";
import * as api from "@prague/client-api";
import { Browser, IClient, IHost } from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import * as Map from "@prague/map";
import { ContanierUrlResolver } from "@prague/routerlicious-host";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import * as $ from "jquery";
// tslint:disable-next-line:no-var-requires
import { registerDocumentServices } from "./utils";

async function loadDocument(
    id: string,
    version: resources.ICommit,
    client: any,
    token: string,
    host: IHost,
): Promise<api.Document> {
    console.log("Loading in root document...");
    const tokenService = new socketStorage.TokenService();
    const claims = tokenService.extractClaims(token);

    const document = await api.load(
        id,
        claims.tenantId,
        host,
        { encrypted: false },
        version);

    console.log("Document loaded");
    return document;
}

async function updateOrCreateKey(key: string, map: Map.ISharedMap, container: JQuery, doc: api.Document) {
    const value = await map.get(key);

    let keyElement = container.find(`>.${key}`);
    const newElement = keyElement.length === 0;
    const isCollab = value instanceof SharedObject;

    if (newElement) {
        keyElement = $(`<div class="${key} ${isCollab ? "collab-object" : ""}"></div>`);
        container.append(keyElement);
    }

    if (isCollab) {
        if (newElement) {
            displayMap(keyElement, key, value, map, doc);
        }
    } else {
        if (key === "set") {
            const set = value as Map.DistributedSet<number>;
            keyElement.text(`${key}: ${JSON.stringify(set.entries())}`);
        } else if (key === "counter") {
            const counter = value as Map.Counter;
            keyElement.text(`${key}: ${counter.value}`);
        } else {
            keyElement.text(`${key}: ${JSON.stringify(value)}`);
        }
    }
}

function displayValues(map: Map.ISharedMap, container: JQuery, doc: api.Document) {
    const keys = map.keys();
    const keyArr = [] as string[];
    for (const key of keys) {
        keyArr.push(key);
    }
    keyArr.sort();

    const values = $("<div></div>");
    for (const key of keyArr) {
        updateOrCreateKey(key, map, values, doc);
    }

    // Listen and process updates
    map.on("valueChanged", async (changed: Map.IValueChanged) => {
        updateOrCreateKey(changed.key, map, values, doc);
    });

    container.append(values);
}

/**
 * Displays the keys in the map
 */
async function displayMap(parentElement: JQuery, key: string, map: Map.ISharedMap,
    // tslint:disable-next-line: align
    parent: Map.ISharedMap, doc: api.Document) {
    const header = key !== null ? $(`<h2>${key}: ${map.id}</h2>`) : $(`<h2>${map.id}</h2>`);

    if (key !== null) {
        const hideMap = $("<button style='float:right;margin-right:20px;'></button");
        hideMap.text("x");
        hideMap.click(() => {
            parentElement.addClass("hidden");
        });
        header.append(hideMap);
    }
    parentElement.append(header);

    const container = $(`<div></div>`);
    const childMaps = $(`<div></div>`);

    displayValues(map, container, doc);

    const randomize = $("<button>Randomize</button>");
    randomize.click((event) => {
        randomizeMap(map);
    });
    parentElement.append(randomize);

    const addMap = $("<button>Add</button>");
    addMap.click(() => {
        const newMap = doc.createMap();
        displayMap(childMaps, null, newMap, map, doc);
    });
    parentElement.append(addMap);

    if (parent && map.isLocal()) {
        const attach = $("<button>Attach</button>");
        attach.click(() => {
            parent.set(map.id, map);
        });
        parentElement.append(attach);
    }

    parentElement.append(container, childMaps);
}

/**
 * Randomly changes the values in the map
 */
async function randomizeMap(map: Map.ISharedMap) {
    // link up the randomize button
    const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];

    const counter: Map.Counter =
        map.set("counter", undefined, Map.CounterValueType.Name).
            get("counter");
    const set: Map.DistributedSet<number> =
        map.set("set", [1, 2, 3, 3, 2, 4], Map.DistributedSetValueType.Name).
            get("set");

    setInterval(async () => {
        // tslint:disable-next-line:insecure-random
        const key = keys[Math.floor(Math.random() * keys.length)];
        // tslint:disable-next-line:insecure-random
        map.set(key, Math.floor(Math.random() * 100000).toString());
        counter.increment(1);
        set.add(5);
        set.add(5);
        set.delete(1);
    }, 1000);
}

export async function load(
    id: string,
    version: resources.ICommit,
    token: string,
    config: any,
    loadPartial: boolean) {

    const resolver = new ContanierUrlResolver(null, null);
    const tokenProvider = new socketStorage.TokenProvider(token);
    const host = { resolver, tokenProvider };

    loadPartial ? loadCommit(id, version, config) : loadFull(id, version, config, token, host);
}

function loadFull(id: string, version: resources.ICommit, config: any, token?: string, host?: IHost) {
    registerDocumentServices(config);

    $(document).ready(() => {
        // Bootstrap worker service.
        loadDocument(id, version, config.client, token, host).then(async (doc) => {
            // tslint:disable-next-line
            window["doc"] = doc;

            const root = doc.getRoot();

            // Display the initial values and then listen for updates
            displayMap($("#mapViews"), null, root, null, doc);

            // Register to run task only if the client type is browser.
            const client = config.client as IClient;
            if (client && client.type === Browser) {
                agent.registerToWork(doc, client, host, config);
            }
        }, (err) => {
            // TODO (auth): Display an error page here.
            console.log(err);
        });
    });
}

function loadCommit(id: string, version: resources.ICommit, config: any) {
    registerDocumentServices(config);

    $(document).ready(() => {
        api.load(
            id,
            undefined, // tenantId
            undefined, // token
            { client: config.client, encrypted: false },
            version,
            false).then(async (doc) => {
                // tslint:disable-next-line
                window["doc"] = doc;

                const root = doc.getRoot();

                // Display the initial values and then listen for updates
                displayMap($("#mapViews"), null, root, null, doc);
            });
    });
}
