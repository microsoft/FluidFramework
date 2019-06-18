/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug, debugDOM } from "./debug";
import { FlatMapDOMTree } from "./flatMapDOMTree";
import { FrameManager } from "./frameManager";
import { globalConfig } from "./globalConfig";
import { IMapViewWrapper, IMapWrapperFactory } from "./mapWrapper";
import { RewriteDOMTree } from "./rewriteDOMTree";
import { StreamDOMTreeServer, StreamWindowServer } from "./streamDOMTreeServer";

async function MapWrapperToObject(mapView: IMapViewWrapper): Promise<object> {
    const obj: any = {};
    await mapView.forEach((value, key) => {
        obj[key] = value;
    });
    return obj;
}

export interface ISaveDOMOptions {
    background: boolean;
    batchOps: boolean;
    contentScriptInitTime: number;
    frameId: number;
    startSignalTime: number;
    startSaveSignalTime: number;
    stream: boolean;
    useFlatMap: boolean;
}

export async function saveDOM(mapWrapperFactory: IMapWrapperFactory, options: ISaveDOMOptions) {

    if (mutationObserver) {
        alert("Content script already streaming");
        return;
    }
    const frameDataContainer = await mapWrapperFactory.getFrameContainerDataMapView();
    const dataMapWrapper = await mapWrapperFactory.getDefaultDataMapView();

    debug("Start sending to Prague for frame ", options.frameId);
    const startTime = performance.now();
    dataMapWrapper.set("CONFIG_BACKGROUND", options.background);
    dataMapWrapper.set("CONFIG_BATCHOPS", options.batchOps);
    dataMapWrapper.set("TIME_INIT", options.contentScriptInitTime);
    dataMapWrapper.set("TIME_STARTSIGNAL", options.startSignalTime - options.contentScriptInitTime);
    dataMapWrapper.set("TIME_STARTSAVE", options.startSaveSignalTime - options.startSignalTime);
    dataMapWrapper.set("TIME_DOCLOAD", startTime - options.startSaveSignalTime);

    dataMapWrapper.set("URL", window.location.href);
    StreamWindowServer.saveDimension(window, dataMapWrapper);
    StreamWindowServer.saveScrollPos(window, dataMapWrapper);

    let endGenTime;
    if (options.useFlatMap) {
        let tree: StreamDOMTreeServer | FlatMapDOMTree;
        const domMapViewWrapper = await mapWrapperFactory.createMapView();

        let rootNodeId;
        if (options.stream) {
            tree = new StreamDOMTreeServer();
        } else {
            tree = new FlatMapDOMTree();
        }
        tree.initializeFromDOM(document);
        rootNodeId = tree.setOnMapWrapper(domMapViewWrapper);

        endGenTime = performance.now();
        dataMapWrapper.set("TIME_GEN", endGenTime - startTime);

        dataMapWrapper.set("DOMFLATMAPNODE", rootNodeId);
        dataMapWrapper.setMapView("DOM", domMapViewWrapper);

        if (globalConfig.debugPragueMap) {
            debugDOM(JSON.stringify(await MapWrapperToObject(domMapViewWrapper)));
        }

        if (options.stream) {
            startStreamToPrague(tree as StreamDOMTreeServer, dataMapWrapper);
        }
    } else {
        if (options.stream) {
            throw new Error("Not Implemented");
        }
        const tree = new RewriteDOMTree();
        tree.initializeFromDOM(document);

        endGenTime = performance.now();
        dataMapWrapper.set("TIME_GEN", endGenTime - startTime);

        dataMapWrapper.setMap("DOM", tree.getMap(mapWrapperFactory));
    }

    const dataName = options.frameId ? "DOMSTREAM_" + options.frameId : "DOMSTREAM";
    frameDataContainer.setMapView(dataName, dataMapWrapper);

    const endTime = performance.now();
    dataMapWrapper.set("TIME_ATTACH", endTime - endGenTime);
    dataMapWrapper.setTimeStamp("END_DATE");
    debug("Finish sending to Prague - " + (endTime - startTime) + "ms");
}

let mutationObserver: MutationObserver;
let streamWindow: StreamWindowServer;
function startStreamToPrague(tree: StreamDOMTreeServer, dataMapView: IMapViewWrapper) {
    stopStreamToPrague();
    let mutation = 0;
    mutationObserver = tree.startStream(document, () => {
        dataMapView.set("MUTATION", mutation++);
        dataMapView.setTimeStamp("MUTATION_DATE");

        // document.write causes us to lose the listener, try to add it back after mutation
        // TODO: See if there is better way of frameId discovery
        FrameManager.ensureFrameIdListener();
    });

    streamWindow = new StreamWindowServer(window, dataMapView, tree);
    FrameManager.startStream(tree);
}

export function stopStreamToPrague() {
    if (mutationObserver) {
        debug("Stop streaming");
        FrameManager.stopStream();
        mutationObserver.disconnect();
        mutationObserver = null;
        streamWindow.stopSync();
        streamWindow = null;
    }
}
