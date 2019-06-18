/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { api, ui } from "@prague/routerlicious";
import * as $ from "jquery";
import performanceNow = require("performance-now");
import * as request from "request";
import * as url from "url";

import prague = api;
import types = prague.types;

// first script loaded
const clockStart = Date.now();

export let theFlow: ui.controls.FlowView;

function downloadRawText(textUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        request.get(url.resolve(document.baseURI, textUrl), (error, response, body: string) => {
            if (error) {
                reject(error);
            } else if (response.statusCode !== 200) {
                reject(response.statusCode);
            } else {
                resolve(body);
            }
        });
    });
}

async function getInsights(map: types.IMap, id: string): Promise<types.IMap> {
    const insights = await map.wait<types.IMap>("insights");
    return insights.wait<types.IMap>(id);
}

function displayError(parentElement: JQuery, error: string) {
    const idElement = $(`<h2>${error}</h2>`);
    parentElement.append(idElement);
}

export async function onLoad(
    id: string,
    tenantId: string,
    endPoints: any,
    pageInk: boolean,
    disableCache: boolean,
    template: string,
    options: any,
    token?: string,
    workerConfig?: any) {

        const host = new ui.ui.BrowserContainerHost();

        prague.socketStorage.registerAsDefault(endPoints.delta, endPoints.storage, tenantId);
        console.log(`collabDoc loading ${id} - ${performanceNow()}`);
        prague.api.load(id, { blockUpdateMarkers: true, token }).then(async (collabDoc) => {
            console.log(`collabDoc loaded ${id} - ${performanceNow()}`);
            const root = await collabDoc.getRoot().getView();
            console.log(`Getting root ${id} - ${performanceNow()}`);

            // If a text element already exists load it direclty - otherwise load in price + prejudice
            const existing = root.has("text");
            if (!existing) {
                console.log(`Not existing ${id} - ${performanceNow()}`);
                root.set("presence", collabDoc.createMap());
                root.set("users", collabDoc.createMap());
                const newString = collabDoc.createString();

                const starterText = template ? await downloadRawText(template) : " ";
                const segments = api.MergeTree.loadSegments(starterText, 0, true);
                for (const segment of segments) {
                    if (segment instanceof api.MergeTree.TextSegment) {
                        newString.insertText(segment.text, newString.client.getLength(),
                            segment.properties);
                    } else {
                        // assume marker
                        const marker = segment as api.MergeTree.Marker;
                        newString.insertMarker(newString.client.getLength(), marker.refType, marker.properties);
                    }
                }

                root.set("text", newString);
                root.set("ink", collabDoc.createMap());

                if (pageInk) {
                    root.set("pageInk", collabDoc.createStream());
                }
            }

            const sharedString = root.get("text");
            console.log(`Shared string ready - ${performanceNow()}`);
            console.log(window.navigator.userAgent);
            console.log(`id is ${id}`);
            console.log(`Partial load fired - ${performanceNow()}`);

            // Higher plane ink
            const inkPlane = root.get("ink");

            // Bindy for insights
            const image = new ui.controls.Image(
                document.createElement("div"),
                url.resolve(document.baseURI, "/public/images/bindy.svg"));

            const containerDiv = document.createElement("div");
            const container = new ui.controls.FlowContainer(
                containerDiv,
                collabDoc,
                sharedString,
                inkPlane,
                image,
                root.get("pageInk") as types.IStream,
                options);
            theFlow = container.flowView;
            host.attach(container);

            getInsights(collabDoc.getRoot(), sharedString.id).then((insightsMap) => {
                container.trackInsights(insightsMap);
            });

            if (sharedString.client.getLength() > 0) {
                theFlow.render(0, true);
            }
            theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;

            theFlow.setEdit(root);

            sharedString.loaded.then(() => {
                theFlow.loadFinished(clockStart);
                console.log(collabDoc.getUser().id);
                const tokenPart = token ? `${token.substring(0, 50)}...` : null;
                $("#doctoken").text(`(id: ${collabDoc.getUser().id}, token: ${tokenPart})`);
            });
        }, (err) => {
            displayError($("#textViews"), err.body);
            console.log(err);
        });
}
