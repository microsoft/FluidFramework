import * as $ from "jquery";
import * as api from "../../api";
import * as socketStorage from "../../socket-storage";

socketStorage.registerAsDefault(document.location.origin);

async function loadDocument(id: string): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id);

    console.log("Document loaded");
    return document;
}

async function displayValues(map: api.IMap, container: JQuery) {
    const keys = await map.keys();
    keys.sort();

    const values = $("<div></div>");
    for (const key of keys) {
        values.append($(`<div class="${key}">${key}: ${await map.get(key)}</div>`));
    }

    container.children().remove();
    container.append(values);
}

/**
 * Displays the keys in the map
 */
async function displayMap(map: api.IMap) {
    const header = $(`<h2>${map.id}</h2>`);
    const container = $(`<div></div>`);

    displayValues(map, container);

    map.on("valueChanged", async (changed) => {
        displayValues(map, container);
    });

    $("#mapViews").append(header, container);
}

/**
 * Randomly changes the values in the map
 */
function randomizeMap(map: api.IMap) {
    // link up the randomize button
    const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];
    setInterval(() => {
        const key = keys[Math.floor(Math.random() * keys.length)];
        map.set(key, Math.floor(Math.random() * 100000).toString());
    }, 1000);
}

export function load(id: string) {
    $(document).ready(() => {
        loadDocument(id).then((doc) => {
            // tslint:disable-next-line
            window["doc"] = doc;

            const root = doc.getRoot();

            // Display the initial values and then listen for updates
            displayMap(root);

            // link up the randomize button
            $("#randomize").click(() => {
                randomizeMap(root);
            });

            $("#addMap").click(() => {
                const map = doc.createMap();
                displayMap(map);
                randomizeMap(map);
            });
        });
    });
}
