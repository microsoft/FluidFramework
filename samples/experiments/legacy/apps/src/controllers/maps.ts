/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { api } from "@prague/routerlicious";
import * as $ from "jquery";
import hasIn = require("lodash/hasIn");

import prague = api;
import types = prague.types;
import Map = api.map;

async function loadDocument(id: string, token?: string): Promise<prague.api.Document> {
    console.log("Loading in root document...");
    const document = await prague.api.load(id, { encrypted: false, token }).catch((err) => {
        return Promise.reject(err);
    });

    console.log("Document loaded");
    return document;
}

async function updateOrCreateKey(key: string, map: types.IMap, container: JQuery, doc: prague.api.Document) {
    const value = await map.get(key);

    let keyElement = container.find(`>.${key}`);
    const newElement = keyElement.length === 0;
    const isCollab = hasIn(value, "__collaborativeObject__");

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

async function displayValues(map: types.IMap, container: JQuery, doc: prague.api.Document) {
    const keys = await map.keys();
    keys.sort();

    const values = $("<div></div>");
    for (const key of keys) {
        updateOrCreateKey(key, map, values, doc);
    }

    // Listen and process updates
    map.on("valueChanged", async (changed: types.IValueChanged ) => {
        updateOrCreateKey(changed.key, map, values, doc);
    });

    container.append(values);
}

/**
 * Displays the keys in the map
 */
async function displayMap(parentElement: JQuery, key: string, map: types.IMap, parent: types.IMap,
                          doc: prague.api.Document) {
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

function displayUserId(parentElement: JQuery, userId: string) {
    // tslint:disable-next-line
    const idElement = $(`<h4 align="right"><span class="userid">${userId} </span><a href="/logout" class="logout">(Logout)</a></h4>`);
    parentElement.append(idElement);
}

function displayError(parentElement: JQuery, error: string) {
    const idElement = $(`<h2>${error}</h2>`);
    parentElement.append(idElement);
}

/**
 * Randomly changes the values in the map
 */
async function randomizeMap(map: types.IMap) {
    // link up the randomize button
    const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];
    const counter = map.set<Map.Counter>("counter", undefined, Map.CounterValueType.Name);
    const set = map.set<Map.DistributedSet<number>>("set", [1, 2, 3, 3, 2, 4], Map.DistributedSetValueType.Name);
    setInterval(async () => {
        const key = keys[Math.floor(Math.random() * keys.length)];
        map.set(key, Math.floor(Math.random() * 100000).toString());
        counter.increment(1);
        set.add(5);
        set.add(5);
        set.delete(1);
    }, 1000);
}

export async function load(id: string, tenantId: string, endPoints: any, token?: string,
                           workerConfig?: any) {
    prague.socketStorage.registerAsDefault(endPoints.delta, endPoints.storage, tenantId);
    $(document).ready(() => {
        loadDocument(id, token).then((doc) => {
            // tslint:disable-next-line
            window["doc"] = doc;

            const root = doc.getRoot();

            // Display the user id.
            displayUserId($("#mapViews"), doc.getUser().id);
            console.log(doc.getUser().id);

            // Display the initial values and then listen for updates
            displayMap($("#mapViews"), null, root, null, doc);
        }, (err) => {
            displayError($("#mapViews"), err.body);
            console.log(err);
        });
    });
}
