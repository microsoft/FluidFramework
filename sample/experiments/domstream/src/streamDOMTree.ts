import { debugDOM } from "./debug";
import * as FMDOM from "./flatMapDOMTree";
import { IMapViewWrapper } from "./mapWrapper";

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

export class StreamDOMElementData extends FMDOM.FlatMapDOMElementData {
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

export class StreamDOMTextNodeData extends FMDOM.FlatMapDOMTextNodeData {
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
    protected rootId: number;
    protected nodeToNodeDataMap: WeakMap<Node, any>;
    protected idToNodeMap: Map<number, Node>;
    protected attrIdToElementMap: Map<number, Element>;
    protected mapData: MapSyncDOMData;

    constructor() {
        super();
        this.nodeToNodeDataMap = new WeakMap();
        this.idToNodeMap = new Map();
        this.attrIdToElementMap = new Map();

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

    protected setMapViewWrapper(mapView: IMapViewWrapper) {
        this.mapData = new MapSyncDOMData(mapView);
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

    protected mapValueChangeCallbackCommon(domNode, key, value, deleted) {
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
            return true;
        }
        if (key === "inputValue") {
            (domNode as HTMLInputElement).value = value;
            return true;
        }
        return false;
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

    public static saveScrollPos(w: Window, dataMapView: IMapViewWrapper) {
        const pos = JSON.stringify([w.scrollX, w.scrollY]);
        debugDOM("Update scrollpos:", pos);
        dataMapView.setIfChanged("SCROLLPOS", pos);
    }

    protected static installScrollListener(w: Window, dataMapView: IMapViewWrapper) {
        // Setup scroll syncing
        const scrollCallback = () => {
            this.saveScrollPos(w, dataMapView);
        };
        w.addEventListener("scroll", scrollCallback);
        return scrollCallback;
    }

    protected static installDataChangeResponder(
        w: Window, dataMapView: IMapViewWrapper, scrollPosField: HTMLSpanElement,
        callback: (key: string, value: any) => void) {

        // Responding to scroll and click events
        dataMapView.onNonLocalValueChanged((key, value) => {
            if (key === "SCROLLPOS") {
                StreamWindow.loadScrollPos(w, value, scrollPosField);
                return;
            }

            callback(key, value);
        });
    }

    protected scrollCallback;
    protected resizeCallback;
    private w: Window;

    constructor(w: Window) {
        this.w = w;
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
