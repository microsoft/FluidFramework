/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debugDOM, debugFrame } from "./debug";
import { IMapViewWrapper } from "./mapWrapper";
import {
    StreamDOMElementData, StreamDOMTextNodeData, StreamDOMTree, StreamWindow,
} from "./streamDOMTree";

export class StreamDOMTreeServer extends StreamDOMTree {
    public setOnMapWrapper(mapView: IMapViewWrapper) {
        this.setMapViewWrapper(mapView);
        this.rootId = this.setOnMapWrapperCommon(this.mapData);
        this.mapData.startSync();
        return this.rootId;
    }

    public updateFrameId(frame: HTMLIFrameElement, frameId: number) {
        const id = this.getNodeId(frame);
        this.mapData.setNodeData(id, "frameId", frameId);
        debugFrame(frameId, "Node", id, "frameId updated", frame.src);
    }

    public startStream(doc: Document, mutationCallback) {
        const mapValueChangeCallback = (nodeId, key, value, deleted) => {
            mutationObserver.disconnect();
            const domNode = this.idToNodeMap.get(nodeId);
            if (domNode) {
                if (!this.mapValueChangeCallbackCommon(domNode, key, value, deleted)) {
                    console.error("Map Change not handled", nodeId, key, value, deleted);
                }
            }

            mutationObserver.observe(doc, config);
        };
        this.mapData.setValueChangeCallback(mapValueChangeCallback);

        // Options for the observer (which mutations to observe)
        const config = { attributes: true, characterData: true, childList: true, subtree: true };

        // Callback function to execute when mutations are observed
        const callback = (mutationsList: Iterable<MutationRecord>, observer) => {
            for (const mutation of mutationsList) {
                const n = mutation.target;
                const node = this.nodeToNodeDataMap.get(n);
                if (!node) {
                    if (n === doc && mutation.type === "childList") {
                        // Reinitialize and emit the document node.
                        this.initializeFromDOM(doc);
                        this.mapData.setNodeData(this.rootId, "documentElementId",
                            this.getRootElement().setOnMapWrapper(this.mapData, this));
                    } else if (doc.documentElement.contains(n)
                        && (n.nodeType !== 1 || !this.isFiltered(n as Element))) {
                        console.error("Target not emitted: ", mutation.type, n);
                    }
                    continue;
                }
                switch (mutation.type) {
                    case "childList":
                        // Could this be a text node?
                        (node as StreamDOMElementData).updateChildList(this.mapData, this);
                        break;
                    case "attributes":
                        const attributeName = mutation.attributeName;
                        (node as StreamDOMElementData).updateAttribute(this.mapData, attributeName);
                        break;
                    case "characterData":
                        if (n.nodeType === 3) {
                            (node as StreamDOMTextNodeData).updateText(this.mapData);
                        } else {
                            console.error("CharacterData changed in Non-Text node " + n);
                        }
                        break;
                }
            }
            mutationCallback();
        };

        // Create an observer instance linked to the callback function
        const mutationObserver = new MutationObserver(callback);

        // Start observing the target node for configured mutations
        mutationObserver.observe(doc, config);

        return mutationObserver;
    }
}

export class StreamWindowServer extends StreamWindow {
    public static saveDimension(w: Window, dataMapView: IMapViewWrapper) {
        const dim = JSON.stringify({
            devicePixelRatio: window.devicePixelRatio,
            height: window.innerHeight,
            width: window.innerWidth,
        });
        debugDOM("Update dimension:", dim);
        dataMapView.setIfChanged("DIMENSION", dim);
    }

    protected static installResizeListener(w: Window, dataMapView: IMapViewWrapper) {
        const resizeCallback = () => {
            this.saveDimension(w, dataMapView);
        };
        w.addEventListener("resize", resizeCallback);
        return resizeCallback;
    }

    constructor(w: Window, dataMapView: IMapViewWrapper, tree: StreamDOMTree, scrollPosField?: HTMLSpanElement) {
        super(w);

        this.scrollCallback = StreamWindowServer.installScrollListener(w, dataMapView);
        this.resizeCallback = StreamWindowServer.installResizeListener(w, dataMapView);

        StreamWindow.installDataChangeResponder(w, dataMapView, scrollPosField,
            (key, value) => {
                if (key === "REMOTECLICK") {
                    const nodeId = value;
                    const n = tree.getNodeFromId(nodeId);

                    if (n) {
                        debugDOM("Dispatching click to node Id: " + nodeId, n);
                        n.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
                    } else {
                        console.error("Click to node Id not found: " + nodeId);
                    }
                    return;
                }
            });
    }
}
