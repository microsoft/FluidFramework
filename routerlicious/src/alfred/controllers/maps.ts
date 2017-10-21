import * as resources from "gitresources";
import * as $ from "jquery";
import * as _ from "lodash";
import * as api from "../../api";
import * as map from "../../map";
import * as shared from "../../shared";
import * as socketStorage from "../../socket-storage";

async function loadDocument(id: string, version: resources.ICommit): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id, { encrypted: false /* api.isUserLoggedIn() */ }, version);

    console.log("Document loaded");
    return document;
}

async function updateOrCreateKey(key: string, map: map.IMap, container: JQuery, doc: api.Document) {
    const value = await map.get(key);

    let keyElement = container.find(`>.${key}`);
    const newElement = keyElement.length === 0;
    const isCollab = _.hasIn(value, "__collaborativeObject__");

    if (newElement) {
        keyElement = $(`<div class="${key} ${isCollab ? "collab-object" : ""}"></div>`);
        container.append(keyElement);
    }

    if (isCollab) {
        if (newElement) {
            displayMap(keyElement, key, value, map, doc);
        }
    } else {
        keyElement.text(`${key}: ${JSON.stringify(value)}`);
    }
}

async function displayValues(map: map.IMap, container: JQuery, doc: api.Document) {
    const keys = await map.keys();
    keys.sort();

    const values = $("<div></div>");
    for (const key of keys) {
        updateOrCreateKey(key, map, values, doc);
    }

    // Listen and process updates
    map.on("valueChanged", async (changed) => {
        updateOrCreateKey(changed.key, map, values, doc);
    });

    container.append(values);
}

/**
 * Displays the keys in the map
 */
async function displayMap(parentElement: JQuery, key: string, map: map.IMap, parent: map.IMap, doc: api.Document) {
    const header = key !== null ? $(`<h2>${key}: ${map.id}</h2>`) : $(`<h2>${map.id}</h2>`);
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
async function randomizeMap(map: map.IMap) {
    // link up the randomize button
    const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];
    const counter = await map.createCounter("counter", 100) as map.ICounter;
    const set = await map.createSet("set", [1, 2, 3, 3, 2, 4]) as map.ISet<number>;
    setInterval(async () => {
        const key = keys[Math.floor(Math.random() * keys.length)];
        map.set(key, Math.floor(Math.random() * 100000).toString());
        counter.increment(1);
        set.add(5);
        set.add(5);
        set.delete(1);
    }, 1000);
}

export function load(id: string, version: resources.ICommit, config: any) {
    socketStorage.registerAsDefault(document.location.origin, config.blobStorageUrl, config.repository);

    $(document).ready(() => {
        // Bootstrap worker service.
        shared.registerWorker(config, "maps");
        loadDocument(id, version).then(async (doc) => {
            // tslint:disable-next-line
            window["doc"] = doc;

            const root = doc.getRoot();

            // Display the initial values and then listen for updates
            displayMap($("#mapViews"), null, root, null, doc);
        });
    });
}
