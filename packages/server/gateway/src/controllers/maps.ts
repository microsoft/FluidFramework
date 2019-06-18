/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as agent from "@prague/agent";
import * as api from "@prague/client-api";
import { Browser, IClient, IHost, IPragueResolvedUrl, IResolvedUrl } from "@prague/container-definitions";
import {
    Counter,
    CounterValueType,
    DistributedSet,
    DistributedSetValueType,
    ISharedMap,
    IValueChanged,
} from "@prague/map";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import { SharedObject } from "@prague/shared-object-common";
import * as $ from "jquery";
import { parse } from "url";
// tslint:disable-next-line:no-var-requires
import { registerDocumentServiceFactory } from "./utils";

async function loadDocument(url: string, host: IHost): Promise<api.Document> {
    console.log("Loading in root document...");

    const document = await api.load(
        url,
        host,
        { encrypted: false });

    console.log("Document loaded");
    return document;
}

async function updateOrCreateKey(key: string, map: ISharedMap, container: JQuery, doc: api.Document) {
    const value = await map.get(key);

    let keyElement = container.find(`>.${key}`);
    const newElement = keyElement.length === 0;
    const isCollab = value instanceof SharedObject;

    if (newElement) {
        // tslint:disable-next-line:no-jquery-raw-elements
        keyElement = $(`<div class="${key} ${isCollab ? "collab-object" : ""}"></div>`);
        container.append(keyElement);
    }

    if (isCollab) {
        if (newElement) {
            displayMap(keyElement, key, value, map, doc);
        }
    } else {
        if (key === "set") {
            const set = value as DistributedSet<number>;
            keyElement.text(`${key}: ${JSON.stringify(set.entries())}`);
        } else if (key === "counter") {
            const counter = value as Counter;
            keyElement.text(`${key}: ${counter.value}`);
        } else {
            keyElement.text(`${key}: ${JSON.stringify(value)}`);
        }
    }
}

function displayValues(map: ISharedMap, container: JQuery, doc: api.Document) {
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
    map.on("valueChanged", async (changed: IValueChanged) => {
        updateOrCreateKey(changed.key, map, values, doc);
    });

    container.append(values);
}

/**
 * Displays the keys in the map
 */
async function displayMap(parentElement: JQuery, key: string, map: ISharedMap,
    // tslint:disable-next-line: align
    parent: ISharedMap, doc: api.Document) {
    // tslint:disable-next-line:no-jquery-raw-elements
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

    // tslint:disable-next-line:no-jquery-raw-elements
    const container = $(`<div></div>`);
    // tslint:disable-next-line:no-jquery-raw-elements
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
async function randomizeMap(map: ISharedMap) {
    // link up the randomize button
    const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];

    const counter: Counter =
        map.set("counter", undefined, CounterValueType.Name).
            get("counter");
    const set: DistributedSet<number> =
        map.set("set", [1, 2, 3, 3, 2, 4], DistributedSetValueType.Name).
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

export async function load(resolved: IPragueResolvedUrl, jwt: string, config: any) {

    const resolver = new ContainerUrlResolver(
        document.location.origin,
        jwt,
        new Map<string, IResolvedUrl>([[resolved.url, resolved]]));
    const host = { resolver };

    const parsedUrl = parse(resolved.url);
    const [, tenantId, documentId] = parsedUrl.path.split("/");
    if (!documentId || !tenantId) {
        // tslint:disable-next-line:max-line-length
        return Promise.reject(`Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`);
    }

    registerDocumentServiceFactory(config);

    $(document).ready(() => {
        // Bootstrap worker service.
        loadDocument(resolved.url, host).then(async (doc) => {
            // tslint:disable-next-line
            window["doc"] = doc;

            const root = doc.getRoot();

            // Display the initial values and then listen for updates
            displayMap($("#mapViews"), null, root, null, doc);

            // Register to run task only if the client type is browser.
            const client = config.client as IClient;
            if (client && client.type === Browser) {
                agent.registerToWork(
                    config.serverUrl,
                    doc,
                    client,
                    host,
                    config,
                    tenantId,
                    documentId);
            }
        }, (err) => {
            // TODO (auth): Display an error page here.
            console.log(err);
        });
    });
}
