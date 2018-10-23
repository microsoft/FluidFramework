import * as pragueApi from "@prague/client-api";
import * as pragueMap from "@prague/map";
// import * as sharedString from "@prague/shared-string";
import * as PFMDOM from "./pragueFlatMapDOMTree";

class PragueMapSyncDOMData extends PFMDOM.PragueMapDOMData {
    private valueChangeCallback:
        (nodeId: number, key: string, value: string, deleted: boolean) => void;
    constructor(mapView: pragueMap.IMapView, collabDoc: pragueApi.Document) {
        super(mapView, collabDoc);
        mapView.getMap().on("valueChanged", (changed, local) => {
            if (local) { return; }
            const combinedKey = changed.key;
            const combinedKeyArray = JSON.parse(combinedKey);
            const nodeId = combinedKeyArray[0];
            const key = combinedKeyArray[1];

            // Update our nodes
            let nodeData = this.nodes[nodeId];
            if (!nodeData) {
                nodeData = {};
                this.nodes[nodeId] = nodeData;
            }
            const deleted = !mapView.has(combinedKey);
            let value;
            if (deleted) {
                delete nodeData[key];
            } else {
                value = mapView.get(combinedKey);
                nodeData[key] = value;
            }
            console.log("Map value changed: ", combinedKey, value);
            if (this.valueChangeCallback) {
                this.valueChangeCallback(nodeId, key, value, deleted);
            }
        });
    }
    public setValueChangeCallback(callback) {
        this.valueChangeCallback = callback;
    }
}

class PragueStreamDOMElement extends PFMDOM.PragueFlatMapDOMElement {
    public initializeFromMap(nodeId: number, attributeId: number, map: PragueMapSyncDOMData) {
        this.nodeId = nodeId;
        this.attributeId = attributeId;
        this.setEmitted(map);
    }
    public updateChildList(map: PragueMapSyncDOMData, tree: PragueStreamDOMTree) {
        this.initializeChildren(tree);
        this.setChildListOnPragueFlatMap(map, tree);
        console.log("Update children: node=" + this.nodeId);
    }
    public updateAttribute(map: PragueMapSyncDOMData, name: string) {
        const unpatchedValue = this.element.getAttribute(name);
        const value = this.patchAttribute(this.getTagName(), name, unpatchedValue, false);

        if (value != null) {
            this.setAttributeOnPragueFlatMap(map, name, value);
            console.log("Update attribute: node=" + this.nodeId + " attributesNode=" + this.attributeId
                + " attribute=" + name + " value=" + value);
        } else {
            console.log("Delete attribute: node=" + this.nodeId + " attributesNode=" + this.attributeId
                + " attribute=" + name);
            map.deleteNodeData(this.attributeId, name);
        }
    }
    protected setEmitted(map: PragueMapSyncDOMData) {
        super.setEmitted(map);

        // Set up DOM -> map updates
        this.element.addEventListener("scroll", () => {
            this.setScrollPosOnPragueFlatMap(map);
        });
    }
}

class PragueStreamDOMTextNode extends PFMDOM.PragueFlatMapDOMTextNode {
    public initializeFromMap(nodeId: number, map: PragueMapSyncDOMData) {
        this.nodeId = nodeId;
        this.setEmitted(map);
    }
    public updateText(map: PragueMapSyncDOMData) {
        this.setTextContentOnPragueFlatMap(map);
        console.log("Update charData: node=" + this.nodeId);
    }
}

class PragueStreamDOMInputElement extends PragueStreamDOMElement {
    public initializeFromMap(nodeId: number, attributeId: number, map: PragueMapSyncDOMData) {
        // Set up extra value from the map
        const input = this.element as HTMLInputElement;
        const nodeData = map.getNodeData(nodeId);
        const value = nodeData.inputValue;
        if (value !== undefined) {
            input.value = value;
        }

        super.initializeFromMap(nodeId, attributeId, map);
    }
    protected setEmitted(map: PragueMapSyncDOMData) {
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
/*
class PragueStreamDOMTextAreaElement extends PragueStreamDOMElement {
    private sharedInput: sharedString.SharedString;
    public initializeFromMap(nodeId: number, attributeId: number, map: PragueMapSyncDOMData) {
        const input = this.element as HTMLInputElement;
        const nodeData = map.getNodeData(nodeId);
        this.sharedInput = nodeData["inputValue"];
        if (this.sharedInput !== undefined) {
            input.value = this.sharedInput.getText();
        }
        super.initializeFromMap(nodeId, attributeId, map);
    }
    protected setEmitted(map: PragueMapSyncDOMData) {
        super.setEmitted(map);

        // Set up DOM -> map updates
        const textArea = this.element as HTMLTextAreaElement;
        textArea.addEventListener("input", () => {
            // Input box entries doesn't update the DOM
            // Manually do it.
            this.sharedInput.replaceText(textArea.value, 0, this.sharedInput.client.getLength());
            map.setNodeData(this.nodeId, "inputValue", textArea.value);
        });

        textArea.selectionStart
        this.sharedInput.createPositionReference()
    }
}
*/
export class PragueStreamDOMTree extends PFMDOM.PragueFlatMapDOMTree {
    private nodeMap: WeakMap<Node, any>;
    private idToNodeMap: Map<number, Node>;
    private attrIdToNodeMap: Map<number, Element>;
    private mapData: PragueMapSyncDOMData;
    private pendingMutationEvent: any[];

    constructor() {
        super();
        this.nodeMap = new WeakMap();
        this.idToNodeMap = new Map();
        this.attrIdToNodeMap = new Map();
        this.pendingMutationEvent = [];
    }
    public getNodeId(node: Node) {
        const n = this.nodeMap.get(node);
        return n ? n.nodeId : -1;
    }
    public getNodeFromId(id: number) {
        return this.idToNodeMap.get(id);
    }
    public setOnPragueFlatMap(mapView: pragueMap.IMapView, collabDoc: pragueApi.Document) {
        this.mapData = new PragueMapSyncDOMData(mapView, collabDoc);
        this.getRootElement().setOnPragueFlatMap(this.mapData, this);
    }
    public notifyNodeEmitted(node: Node, nodeId: number) {
        this.idToNodeMap.set(nodeId, node);
    }
    public notifyElementEmitted(element: Element, nodeId: number, attributeId: number) {
        this.notifyNodeEmitted(element, nodeId);
        this.attrIdToNodeMap.set(attributeId, element);
    }
    public getElementNode(e: Element) {
        const node = this.nodeMap.get(e);
        if (node) { return node; }
        return super.getElementNode(e);
    }
    public getTextNode(n: Node) {
        const node = this.nodeMap.get(n);
        if (node) { return node; }
        return super.getTextNode(n);
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
                const node = this.nodeMap.get(n);
                if (!node) {
                    console.error("Target not emitted?");
                }
                switch (mutation.type) {
                    case "childList":
                        // Could this be a text node?
                        (node as PragueStreamDOMElement).updateChildList(this.mapData, this);
                        break;
                    case "attributes":
                        const attributeName = mutation.attributeName;
                        (node as PragueStreamDOMElement).updateAttribute(this.mapData, attributeName);
                        break;
                    case "characterData":
                        if (n.nodeType === 3) {
                            (node as PragueStreamDOMTextNode).updateText(this.mapData);
                        } else {
                            console.log("CharacterData changed in Non-Text node " + n);
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

    public readFromMap(mapView: pragueMap.IMapView, collabDoc: pragueApi.Document, rootId: number, doc: Document) {
        this.mapData = new PragueMapSyncDOMData(mapView, collabDoc);
        this.mapData.setValueChangeCallback((nodeId, key, value, deleted) => {
            this.mapValueChangeCallback(nodeId, key, value, deleted);
        });
        doc.open();
        doc.write("<!DOCTYPE html>");
        doc.close();
        doc.replaceChild(this.createDOMNodeFromMapData(rootId, doc), doc.documentElement);
    }

    public FlushPendingMutationEvent() {
        console.log("Flushing Mutation event: " + this.pendingMutationEvent.length);
        for (const { nodeId, key, value, deleted } of this.pendingMutationEvent) {
            this.processMutationEvent(nodeId, key, value, deleted);
        }
        this.pendingMutationEvent.length = 0;
    }
    protected createElementNode(e: Element): PragueStreamDOMElement {
        let newNode;
        if (e.tagName.toUpperCase() === "INPUT") {
            newNode = new PragueStreamDOMInputElement(e, this);
        } else {
            newNode = new PragueStreamDOMElement(e, this);
        }
        this.nodeMap.set(e, newNode);
        return newNode;
    }
    protected createTextNode(n: Node): PragueStreamDOMTextNode {
        const newNode = new PragueStreamDOMTextNode(n);
        this.nodeMap.set(n, newNode);
        return newNode;
    }

    private processMutationEvent(nodeId, key, value, deleted) {
        const domNode = this.idToNodeMap.get(nodeId);
        if (domNode) {
            if (key === "textContent") {
                domNode.textContent = value;
                return;
            }
            if (key !== "children") {
                console.error("Unknown DOM node key changed ", nodeId, key);
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
        const attributeDOMNode: Element = this.attrIdToNodeMap.get(nodeId);
        if (attributeDOMNode) {
            if (deleted) {
                attributeDOMNode.removeAttribute(key);
            } else {
                try {
                    attributeDOMNode.setAttribute(key, value);
                } catch (e) {
                    console.log("Invalid attribute name: " + key);
                }
            }
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
        console.log("Creating DOM Node: ", nodeId);
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
                        element.setAttribute(attr, attributes[attr]);
                    } catch (e) {
                        console.log("Invalid attribute name: " + attr);
                    }
                }
            }

            const childrenNodeIdList = nodeData.children;
            for (const childNodeId of childrenNodeIdList) {
                element.appendChild(this.createDOMNodeFromMapData(childNodeId, doc));
            }

            this.attrIdToNodeMap.set(attributesNodeId, element);
            newNode = this.createElementNode(element);
            newNode.initializeFromMap(nodeId, attributesNodeId, this.mapData);
        } else {
            domNode = doc.createTextNode(nodeData.textContent);
            newNode = this.createTextNode(domNode);
            newNode.initializeFromMap(nodeId, this.mapData);
        }
        this.idToNodeMap.set(nodeId, domNode);
        return domNode;
    }
}
