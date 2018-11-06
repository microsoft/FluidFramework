import { debugDOM, debugFrame } from "./debug";
import * as FMDOM from "./flatMapDOMTree";
import { globalConfig } from "./globalConfig";
import { IMapViewWrapper } from "./mapWrapper";

export interface IFrameLoader {
    loadFrame(frame: HTMLIFrameElement, frameId: number);
    reloadFrame(frame: HTMLIFrameElement, frameId: number);
}

class MapSyncDOMData extends FMDOM.MapDOMData {
    private valueChangeCallback:
        (nodeId: number, key: string, value: string, deleted: boolean) => void;
    constructor(mapView: IMapViewWrapper) {
        super(mapView);
    }
    public async Populate() {
        await super.Populate();
        this.startSync();
    }
    public startSync() {
        this.mapView.onNonLocalValueChanged((combinedKey: string, value: any, deleted: boolean) => {
            const combinedKeyArray = JSON.parse(combinedKey);
            const nodeId = combinedKeyArray[0];
            const key = combinedKeyArray[1];

            // Update our nodes
            let nodeData = this.nodes[nodeId];
            if (!nodeData) {
                nodeData = {};
                this.nodes[nodeId] = nodeData;
            }
            if (deleted) {
                delete nodeData[key];
            } else {
                nodeData[key] = value;
            }
            debugDOM("Map value changed: ", combinedKey, value);
            if (this.valueChangeCallback) {
                this.valueChangeCallback(nodeId, key, value, deleted);
            }
        });
    }
    public setValueChangeCallback(callback) {
        this.valueChangeCallback = callback;
    }
}

class StreamDOMElementData extends FMDOM.FlatMapDOMElementData {
    public initializeFromMap(nodeId: number, attributeId: number, map: MapSyncDOMData) {
        this.nodeId = nodeId;
        this.attributeId = attributeId;
        this.setEmitted(map);
    }
    public updateChildList(map: MapSyncDOMData, tree: StreamDOMTree) {
        this.initializeChildren(tree);
        this.setChildListOnFlatMap(map, tree);
        debugDOM("Update children: node=" + this.nodeId);
    }
    public updateAttribute(map: MapSyncDOMData, name: string) {
        const unpatchedValue = this.element.getAttribute(name);
        const value = this.patchAttribute(this.getTagName(), name, unpatchedValue, false);

        if (value != null) {
            this.setAttributeOnFlatMap(map, name, value);
            debugDOM("Update attribute: node=" + this.nodeId + " attributesNode=" + this.attributeId
                + " attribute=" + name + " value=" + value);

            // TODO: Should this be a subclass
            if (this.getTagName() === "IFRAME" && name === "src") {
                // Also update the frameId after navigate
                this.setFrameIdOnMap(map);
            }
        } else {
            debugDOM("Delete attribute: node=" + this.nodeId + " attributesNode=" + this.attributeId
                + " attribute=" + name);
            map.deleteNodeData(this.attributeId, name);
        }
    }
    protected setEmitted(map: MapSyncDOMData) {
        super.setEmitted(map);

        // Set up DOM -> map updates
        this.element.addEventListener("scroll", () => {
            this.setScrollPosOnFlatMap(map);
        });
    }
}

class StreamDOMTextNodeData extends FMDOM.FlatMapDOMTextNodeData {
    public initializeFromMap(nodeId: number, map: MapSyncDOMData) {
        this.nodeId = nodeId;
        this.setEmitted(map);
    }
    public updateText(map: MapSyncDOMData) {
        this.setTextContentOnFlatMap(map);
        debugDOM("Update charData: node=" + this.nodeId);
    }
}

class StreamDOMInputElementData extends StreamDOMElementData {
    public initializeFromMap(nodeId: number, attributeId: number, map: MapSyncDOMData) {
        // Set up extra value from the map
        const input = this.element as HTMLInputElement;
        const nodeData = map.getNodeData(nodeId);
        const value = nodeData.inputValue;
        if (value !== undefined) {
            input.value = value;
        }

        super.initializeFromMap(nodeId, attributeId, map);
    }
    protected setEmitted(map: MapSyncDOMData) {
        super.setEmitted(map);

        // Set up DOM -> map updates
        const input = this.element as HTMLInputElement;
        input.addEventListener("input", () => {
            if (input.type === "text" || input.type === "search") {
                // Input box entries doesn't update the DOM
                // Manually do it.
                map.setNodeData(this.nodeId, "inputValue", input.value);
            }
        });
    }
}

export class StreamDOMTree extends FMDOM.FlatMapDOMTree {
    private rootId: number;
    private nodeToNodeDataMap: WeakMap<Node, any>;
    private idToNodeMap: Map<number, Node>;
    private attrIdToElementMap: Map<number, Element>;
    private mapData: MapSyncDOMData;
    private pendingMutationEvent: any[];
    private frameLoader: IFrameLoader;

    constructor(frameLoader?: IFrameLoader) {
        super();
        this.nodeToNodeDataMap = new WeakMap();
        this.idToNodeMap = new Map();
        this.attrIdToElementMap = new Map();
        this.pendingMutationEvent = [];
        this.frameLoader = frameLoader;
    }
    public getNodeId(node: Node) {
        const n = this.nodeToNodeDataMap.get(node);
        return n ? n.nodeId : -1;
    }
    public getNodeData(node: Node) {
        const id = this.getNodeId(node);
        return this.mapData.getNodeData(id);
    }
    public getNodeFromId(id: number) {
        return this.idToNodeMap.get(id);
    }
    public setOnMapWrapper(mapView: IMapViewWrapper) {
        this.mapData = new MapSyncDOMData(mapView);
        this.rootId = this.setOnMapWrapperCommon(this.mapData);
        this.mapData.startSync();
        return this.rootId;
    }
    public notifyNodeEmitted(node: Node, nodeId: number) {
        this.idToNodeMap.set(nodeId, node);
    }
    public notifyElementEmitted(element: Element, nodeId: number, attributeId: number) {
        this.notifyNodeEmitted(element, nodeId);
        this.attrIdToElementMap.set(attributeId, element);
    }
    public getElementNode(e: Element) {
        const node = this.nodeToNodeDataMap.get(e);
        if (node) { return node; }
        return super.getElementNode(e);
    }
    public getTextNode(n: Node) {
        const node = this.nodeToNodeDataMap.get(n);
        if (node) { return node; }
        return super.getTextNode(n);
    }
    public updateFrameId(frame: HTMLIFrameElement, frameId: number) {
        const id = this.getNodeId(frame);
        this.mapData.setNodeData(id, "frameId", frameId);
        debugFrame(frameId, "Node", id, "frameId updated", frame.src);
    }

    public startStream(doc: Document, mutationCallback) {
        const mapValueChangeCallback = (nodeId, key, value, deleted) => {
            mutationObserver.disconnect();
            this.mapValueChangeCallback(nodeId, key, value, deleted);
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
                    } else if (n.nodeType !== 1 || !this.isFiltered(n as Element)) {
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

    public async readFromMap(mapView: IMapViewWrapper, rootId: number, doc: Document) {
        this.mapData = new MapSyncDOMData(mapView);
        await this.mapData.Populate();
        this.mapData.setValueChangeCallback((nodeId, key, value, deleted) => {
            this.mapValueChangeCallback(nodeId, key, value, deleted);
        });

        this.rootId = rootId;
        this.doc = doc;
        const rootNodeData = this.mapData.getNodeData(rootId);
        /* TODO: Why doesn't this work?
        if (rootNodeData.docType) {
            const docType = document.implementation.createDocumentType(
                rootNodeData.docType[0],
                rootNodeData.docType[1],
                rootNodeData.docType[2]);
            if (doc.doctype) {
                doc.replaceChild(docType, doc.doctype);
            } else {
                doc.prepend(docType);
            }
        }
        */
        doc.open();
        doc.write("<!DOCTYPE html>");
        doc.close();
        doc.replaceChild(this.createDOMNodeFromMapData(rootNodeData.documentElementId, doc), doc.documentElement);
    }

    public FlushPendingMutationEvent() {
        debugDOM("Flushing Mutation event: " + this.pendingMutationEvent.length);
        for (const { nodeId, key, value, deleted } of this.pendingMutationEvent) {
            this.processMutationEvent(nodeId, key, value, deleted);
        }
        this.pendingMutationEvent.length = 0;
    }
    protected createElementNode(e: Element): StreamDOMElementData {
        let newNodeData;
        const tagName = e.tagName.toUpperCase();
        if (tagName === "INPUT") {
            newNodeData = new StreamDOMInputElementData(e, this);
        } else {
            newNodeData = new StreamDOMElementData(e, this);
        }
        this.nodeToNodeDataMap.set(e, newNodeData);
        return newNodeData;
    }
    protected createTextNode(n: Node): StreamDOMTextNodeData {
        const newNodeData = new StreamDOMTextNodeData(n);
        this.nodeToNodeDataMap.set(n, newNodeData);
        return newNodeData;
    }

    private processMutationEvent(nodeId, key, value, deleted) {
        const domNode = this.idToNodeMap.get(nodeId);
        if (domNode) {
            if (key === "textContent") {
                domNode.textContent = value;
                return;
            }
            if (key !== "children") {
                console.error("Unknown DOM node key changed", nodeId, key, value, deleted);
                return;
            }

            // TODO: This doesn't full replicate the order of operation on the client side.
            // If we have move node forward from the back of the list, we would remove the
            // rest of the node and then insert it back instead.
            const childNodeToNewIndexMap = new Map<Node, number>();

            let index = 0;
            for (const childNodeId of value) {
                const node = this.idToNodeMap.get(childNodeId);
                if (node) {
                    childNodeToNewIndexMap.set(node, index);
                }
                index++;
            }
            let currChild: Node = domNode.firstChild;
            let lastIndex = -1;
            while (currChild != null) {
                const nextChild = currChild.nextSibling;
                if (!childNodeToNewIndexMap.has(currChild)) {
                    domNode.removeChild(currChild);
                } else {
                    const currChildIndex = childNodeToNewIndexMap.get(currChild);
                    if (lastIndex < currChildIndex) {
                        lastIndex = currChildIndex;
                    } else {
                        domNode.removeChild(currChild);
                    }
                }
                currChild = nextChild;
            }
            currChild = domNode.firstChild;
            let nextInsertIndex = 0;
            while (currChild != null) {
                const childIndex = childNodeToNewIndexMap.get(currChild);
                for (let i = nextInsertIndex; i < childIndex; i++) {
                    domNode.insertBefore(this.createDOMNodeFromMapData(value[i], domNode.ownerDocument), currChild);
                }
                currChild = currChild.nextSibling;
                nextInsertIndex = childIndex + 1;
            }
            for (let i = nextInsertIndex; i < value.length; i++) {
                domNode.appendChild(this.createDOMNodeFromMapData(value[i], domNode.ownerDocument));
            }
            return;
        }
        const attributeDOMNode: Element = this.attrIdToElementMap.get(nodeId);
        if (attributeDOMNode) {
            if (deleted) {
                attributeDOMNode.removeAttribute(key);
            } else {
                try {
                    attributeDOMNode.setAttribute(key, value);
                } catch (e) {
                    console.error("Invalid attribute name:", key);
                }
            }
            return;
        }

        if (nodeId === this.rootId) {
            if (key !== "documentElementId") {
                console.error("Unknown document node key changed", nodeId, key, value, deleted);
                return;
            }

            const doc = this.getDocument();
            doc.replaceChild(this.createDOMNodeFromMapData(value, doc), doc.documentElement);
        }
    }
    private mapValueChangeCallback(nodeId, key, value, deleted) {
        const domNode = this.idToNodeMap.get(nodeId);
        if (domNode) {
            if (key === "scrollPos") {
                const element = domNode as HTMLElement;
                if (deleted) {
                    element.scrollLeft = 0;
                    element.scrollTop = 0;
                } else {
                    const pos = JSON.parse(value);
                    element.scrollLeft = pos[0];
                    element.scrollTop = pos[1];
                }
                return;
            }
            if (key === "inputValue") {
                (domNode as HTMLInputElement).value = value;
                return;
            }
            if (key === "frameId") {
                debugFrame(value, "Node", nodeId, "frameId updated");
                this.frameLoader.reloadFrame(domNode as HTMLIFrameElement, value);
                return;
            }
        }

        this.pendingMutationEvent.push({
            deleted,
            key,
            nodeId,
            value,
        });
    }
    private createDOMNodeFromMapData(nodeId: number, doc: Document): Node {
        let domNode: Node = this.idToNodeMap.get(nodeId);
        if (domNode) { return domNode; }
        let newNode;
        const nodeData = this.mapData.getNodeData(nodeId);
        const tagName = nodeData.tagName;

        if (tagName) {
            const namespaceURI = nodeData.namespaceURI;
            let element;
            if (namespaceURI) {
                element = doc.createElementNS(namespaceURI, tagName);
            } else {
                element = doc.createElement(tagName);
            }
            domNode = element;

            const attributesNodeId = nodeData.attributes;
            const attributes = this.mapData.getNodeData(attributesNodeId);
            if (attributes) {
                for (const attr of Object.keys(attributes)) {
                    try {
                        if (attr === "xlink:href") {
                            // TODO: save the NS in the map
                            element.setAttributeNS("http://www.w3.org/1999/xlink", attr, attributes[attr]);
                        } else {
                            element.setAttribute(attr, attributes[attr]);
                        }
                    } catch (e) {
                        console.error("Invalid attribute name: " + attr);
                    }
                }
            }

            const childrenNodeIdList = nodeData.children;
            for (const childNodeId of childrenNodeIdList) {
                element.appendChild(this.createDOMNodeFromMapData(childNodeId, doc));
            }

            this.attrIdToElementMap.set(attributesNodeId, element);
            newNode = this.createElementNode(element);
            newNode.initializeFromMap(nodeId, attributesNodeId, this.mapData);

            if (this.frameLoader && tagName === "IFRAME") {
                if (nodeData.frameId > 0) {
                    debugFrame(nodeData.frameId, "Node", nodeId, "iframe create with frameId");
                    this.frameLoader.loadFrame(element, nodeData.frameId);
                } else {
                    debugFrame(-1, "Node", nodeId, "iframe created without frameId");
                }
            }
        } else {
            domNode = doc.createTextNode(nodeData.textContent);
            newNode = this.createTextNode(domNode);
            newNode.initializeFromMap(nodeId, this.mapData);
        }
        this.idToNodeMap.set(nodeId, domNode);
        return domNode;
    }
}

export class StreamWindow {
    public static loadScrollPos(w: Window, scrollPosJsonStr: string, scrollPosField?: HTMLSpanElement) {
        const scrollPos = JSON.parse(scrollPosJsonStr);
        debugDOM("Loading scrollPos: ", scrollPos);
        if (scrollPos) {
            if (scrollPosField) {
                scrollPosField.innerHTML = scrollPos[0] + ", " + scrollPos[1];
            }
            w.scrollTo(scrollPos[0], scrollPos[1]);
        }
    }

    private static installScrollListener(w: Window, dataMapView: IMapViewWrapper) {
        // Setup scroll syncing
        const scrollCallback = () => {
            const pos = JSON.stringify([w.scrollX, w.scrollY]);
            debugDOM("Update scrollpos: " + pos);
            dataMapView.setIfChanged("SCROLLPOS", pos);
        };
        w.addEventListener("scroll", scrollCallback);
        return scrollCallback;
    }

    private static installClickListener(w: Window, dataMapView: IMapViewWrapper, tree: StreamDOMTree) {
        const clickCallback = (ev: MouseEvent) => {
            const id = tree.getNodeId(ev.target as Node);
            debugDOM("Send click to node id: " + id, ev.target);
            dataMapView.set("REMOTECLICK", id);
        };
        w.addEventListener("click", clickCallback);
        return clickCallback;
    }

    private static installResizeListener(w: Window, dataMapView: IMapViewWrapper) {
        const resizeCallback = () => {
            const dim = { width: w.innerWidth, height: w.innerHeight };
            debugDOM("Update dimension: " + dim);
            dataMapView.setIfChanged("DIMENSION", JSON.stringify(dim));
        };
        w.addEventListener("resize", resizeCallback);
        return resizeCallback;
    }

    private static installDataChangeResponder(
        w: Window, dataMapView: IMapViewWrapper, tree: StreamDOMTree,
        isRemote: boolean, scrollPosField?: HTMLSpanElement) {

        // Responding to scroll and click events
        dataMapView.onNonLocalValueChanged((key, value) => {
            if (key === "SCROLLPOS") {
                StreamWindow.loadScrollPos(w, value, scrollPosField);
                return;
            }

            if (isRemote) {
                if (key === "MUTATION") {
                    tree.FlushPendingMutationEvent();
                    return;
                }
            } else {
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
            }
        });
    }
    private w: Window;
    private scrollCallback;
    private resizeCallback;

    constructor(
        w: Window, dataMapView: IMapViewWrapper, tree: StreamDOMTree,
        isRemote: boolean, scrollPosField?: HTMLSpanElement) {

        this.w = w;

        if (isRemote) {
            if (globalConfig.allowInteraction) {
                this.scrollCallback = StreamWindow.installScrollListener(w, dataMapView);
                StreamWindow.installClickListener(w, dataMapView, tree);
            }
        } else {
            this.scrollCallback = StreamWindow.installScrollListener(w, dataMapView);
            this.resizeCallback = StreamWindow.installResizeListener(w, dataMapView);
        }

        StreamWindow.installDataChangeResponder(w, dataMapView, tree, isRemote, scrollPosField);
    }
    public stopSync() {
        if (this.scrollCallback) {
            this.w.removeEventListener("scroll", this.scrollCallback);
        }
        if (this.resizeCallback) {
            this.w.removeEventListener("resize", this.resizeCallback);
        }
    }
}
