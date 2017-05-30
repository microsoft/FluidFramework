import * as $ from "jquery";
import * as _ from "lodash";
import * as api from "../../api";
import * as socketStorage from "../../socket-storage";
import { RateCounter } from "../../utils/counters";

socketStorage.registerAsDefault(document.location.origin);

const form = document.getElementById("text-form") as HTMLFormElement;
const intervalElement = document.getElementById("interval") as HTMLInputElement;

let root: api.IMap;

const messageStart = {};
let avgLatency: number = 0;
let index = 0;

async function loadDocument(id: string): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id);

    console.log("Document loaded");
    return document;
}

async function updateOrCreateKey(key: string, map: api.IMap, container: JQuery, doc: api.Document) {
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
            displayMap(keyElement, value, map, doc);
        }
    } else {
        keyElement.text(`${key}: ${JSON.stringify(value)}`);
    }
}

async function displayValues(map: api.IMap, container: JQuery, doc: api.Document) {
    const keys = await map.keys();
    keys.sort();

    const values = $("<div></div>");
    const latencyText = $("<div>Average latency: </div>");
    const latencyValue = $("<div>0</div>");
    for (const key of keys) {
        updateOrCreateKey(key, map, values, doc);
    }

    // Listen and show updates
    map.on("valueChanged", async (changed) => {
        updateOrCreateKey(changed.key, map, values, doc);
    });

    // Initialize counters
    const ackCounter = new RateCounter();
    ackCounter.reset();
    const latencyCounter = new RateCounter();
    latencyCounter.reset();

    // Listen and calculate latency
    map.on("op", (message) => {
        if (message.clientSequenceNumber) {
            ackCounter.increment(1);
            const roundTrip = Date.now() - messageStart[message.clientSequenceNumber];
            delete messageStart[message.clientSequenceNumber];
            latencyCounter.increment(roundTrip);
            avgLatency = latencyCounter.getValue() / message.clientSequenceNumber;
            latencyValue.text(`${(avgLatency / 1000).toFixed(2)} seconds`);
        }

    });

    container.append(values, latencyText, latencyValue);
}

/**
 * Displays the keys in the map
 */
async function displayMap(parentElement: JQuery, map: api.IMap, parent: api.IMap, doc: api.Document) {
    const header = $(`<h2>${map.id}</h2>`);
    parentElement.append(header);

    const container = $(`<div></div>`);
    displayValues(map, container, doc);

    $("#mapValues").append(container);
}

form.addEventListener("submit", (event) => {
    const intervalTime = Number.parseInt(intervalElement.value);
    console.log(`Submit with ${intervalTime}`);
    randomizeMap(root, intervalTime);
    event.preventDefault();
    event.stopPropagation();
});

/**
 * Randomly changes the values in the map
 */
function randomizeMap(map: api.IMap, interval: number) {
    // link up the randomize button
    const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];
    setInterval(() => {
        const key = keys[Math.floor(Math.random() * keys.length)];
        map.set(key, Math.floor(Math.random() * 100000).toString());
        messageStart[++index] = Date.now();
    }, interval);
}

export function load(id: string) {
    $(document).ready(() => {
        loadDocument(id).then(async (doc) => {
            // tslint:disable-next-line
            window["doc"] = doc;

            root = doc.getRoot();

            // Display the initial values and then listen for updates
            displayMap($("#mapHeader"), root, null, doc);
        });
    });
}
