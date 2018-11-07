import { debugDOM, debugFrame } from "./debug";
import { globalConfig } from "./globalConfig";
import { IMapViewWrapper } from "./mapWrapper";
import { StreamDOMTree, StreamWindow } from "./streamDOMTree";

export interface IFrameLoader {
    loadFrame(frame: HTMLIFrameElement, frameId: number);
    reloadFrame(frame: HTMLIFrameElement, frameId: number);
}

export class StreamDOMTreeClient extends StreamDOMTree {
    private pendingMutationEvent: any[];
    private frameLoader: IFrameLoader;

    constructor(frameLoader?: IFrameLoader) {
        super();
        this.pendingMutationEvent = [];
        this.frameLoader = frameLoader;
    }
    public async readFromMap(mapView: IMapViewWrapper, rootId: number, doc: Document) {
        this.setMapViewWrapper(mapView);
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

    private mapValueChangeCallback(nodeId, key, value, deleted) {
        const domNode = this.idToNodeMap.get(nodeId);
        if (domNode) {
            if (this.mapValueChangeCallbackCommon(domNode, key, value, deleted)) {
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
}

export class StreamWindowClient extends StreamWindow {
    private static installClickListener(w: Window, dataMapView: IMapViewWrapper, tree: StreamDOMTree) {
        const clickCallback = (ev: MouseEvent) => {
            const id = tree.getNodeId(ev.target as Node);
            debugDOM("Send click to node id: " + id, ev.target);
            dataMapView.set("REMOTECLICK", id);
        };
        w.addEventListener("click", clickCallback);
        return clickCallback;
    }

    constructor(w: Window, dataMapView: IMapViewWrapper, tree: StreamDOMTreeClient, scrollPosField?: HTMLSpanElement) {
        super(w);
        if (globalConfig.allowInteraction) {
            this.scrollCallback = StreamWindow.installScrollListener(w, dataMapView);
            StreamWindowClient.installClickListener(w, dataMapView, tree);
        }

        StreamWindow.installDataChangeResponder(w, dataMapView, scrollPosField,
            (key, value) => {
                if (key === "MUTATION") {
                    tree.FlushPendingMutationEvent();
                    return;
                }
            });
    }
}
