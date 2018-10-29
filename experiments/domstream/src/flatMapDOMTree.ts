import { IMapViewWrapper } from "./mapWrapper";
import * as RWDOM from "./rewriteDOMTree";

export class MapDOMData {
    protected nodes = [];
    protected mapView: IMapViewWrapper;
    constructor(mapView: IMapViewWrapper) {
        this.mapView = mapView;
    }

    public async Populate() {
        await this.mapView.forEach((value, key) => {
            const nodeKey = JSON.parse(key);
            const nodeId = nodeKey[0];
            if (!this.nodes[nodeId]) {
                this.nodes[nodeId] = {};
            }
            this.nodes[nodeId][nodeKey[1]] = value;
        });
    }

    public getNodeData(nodeId: number) {
        return this.nodes[nodeId];
    }

    public addNodeData(): number {
        const id = this.nodes.length;
        this.nodes[id] = {};
        return id;
    }
    public setNodeData(nodeId: number, key: string, value) {
        if (this.nodes[nodeId][key] === value) { return; }
        this.nodes[nodeId][key] = value;
        this.mapView.set(JSON.stringify([nodeId, key]), value);
    }

    public deleteNodeData(nodeId: number, key: string) {
        delete this.nodes[nodeId][key];
        this.mapView.delete(JSON.stringify([nodeId, key]));
    }
}

interface IFlatMapDOMNode extends RWDOM.IRewriteDOMNode {
    setOnMapWrapper(map: MapDOMData, tree: FlatMapDOMTree): number;
}

export class FlatMapDOMElement extends RWDOM.RewriteDOMElement implements IFlatMapDOMNode {
    protected emitted: boolean;
    protected nodeId: number;
    protected attributeId: number;
    constructor(e: Element, tree: FlatMapDOMTree) {
        super(e, tree);
        this.emitted = false;
    }
    public setOnMapWrapper(map: MapDOMData, tree: FlatMapDOMTree): number {
        if (this.emitted) { return this.nodeId; }
        this.nodeId = map.addNodeData();
        map.setNodeData(this.nodeId, "tagName", this.getTagName());

        if (this.needExplicitNS()) {
            map.setNodeData(this.nodeId, "namespaceURI", this.element.namespaceURI);
        }
        this.setScrollPosOnFlatMap(map);

        this.attributeId = map.addNodeData();
        map.setNodeData(this.nodeId, "attributes", this.attributeId);

        this.forEachOriginalNodeAttribute((key: string, value: string) => {
            this.setAttributeOnFlatMap(map, key, value);
        });

        this.setChildListOnFlatMap(map, tree);

        this.setEmitted(map);
        tree.notifyElementEmitted(this.element, this.nodeId, this.attributeId);
        return this.nodeId;
    }
    public setAttributeOnFlatMap(map: MapDOMData, key: string, value: string) {
        map.setNodeData(this.attributeId, key, value);
    }
    public setChildListOnFlatMap(map: MapDOMData, tree: FlatMapDOMTree) {
        const childrenIds = [];
        this.forEachOriginalNodeChild((c) => {
            const child = c as IFlatMapDOMNode;
            childrenIds.push(child.setOnMapWrapper(map, tree));
        });
        map.setNodeData(this.nodeId, "children", childrenIds);
    }
    public getNodeId() {
        return this.nodeId;
    }
    protected setEmitted(map: MapDOMData) {
        this.emitted = true;
    }
    protected setScrollPosOnFlatMap(map: MapDOMData) {
        if (this.element.scrollTop || this.element.scrollLeft) {
            map.setNodeData(this.nodeId, "scrollPos",
                JSON.stringify([this.element.scrollLeft, this.element.scrollTop]));
        } else {
            map.deleteNodeData(this.nodeId, "scrollPos");
        }
    }
}

export class FlatMapDOMTextNode extends RWDOM.RewriteDOMTextNode implements IFlatMapDOMNode {
    protected nodeId: number;
    private emitted: boolean;
    constructor(n: Node) {
        super(n);
        this.emitted = false;
    }
    public setOnMapWrapper(map: MapDOMData, tree: FlatMapDOMTree): number {
        if (this.emitted) { return this.nodeId; }
        this.nodeId = map.addNodeData();
        this.setTextContentOnFlatMap(map);
        tree.notifyNodeEmitted(this.node, this.nodeId);
        this.setEmitted(map);
        return this.nodeId;
    }
    protected setEmitted(map: MapDOMData) {
        this.emitted = true;
    }
    protected setTextContentOnFlatMap(map: MapDOMData) {
        map.setNodeData(this.nodeId, "textContent", this.getTextContent());
    }
}

export class FlatMapDOMTree extends RWDOM.RewriteDOMTree {
    public setOnMapWrapper(map: IMapViewWrapper) {
        const mapData = new MapDOMData(map);
        this.getRootElement().setOnMapWrapper(mapData, this);
    }
    public getRootElement(): FlatMapDOMElement {
        return this.rootElement as FlatMapDOMElement;
    }
    public notifyNodeEmitted(node: Node, nodeId: number) {
        // Do nothing
    }
    public notifyElementEmitted(element: Element, nodeId: number, attributeId: number) {
        // Do nothing
    }
    protected createElementNode(e: Element): FlatMapDOMElement {
        return new FlatMapDOMElement(e, this);
    }
    protected createTextNode(n: Node): FlatMapDOMTextNode {
        return new FlatMapDOMTextNode(n);
    }
}
