import { IMapViewWrapper } from "./mapWrapper";
import * as RWDOM from "./rewriteDOMTree";

export class PragueMapDOMData {
    protected nodes = [];
    private mapView: IMapViewWrapper;
    constructor(mapView: IMapViewWrapper) {
        this.mapView = mapView;
        mapView.forEach((value, key) => {
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

interface IPragueFlatMapDOMNode extends RWDOM.IRewriteDOMNode {
    setOnMapWrapper(map: PragueMapDOMData, tree: PragueFlatMapDOMTree): number;
}

export class PragueFlatMapDOMElement extends RWDOM.RewriteDOMElement implements IPragueFlatMapDOMNode {
    protected emitted: boolean;
    protected nodeId: number;
    protected attributeId: number;
    constructor(e: Element, tree: PragueFlatMapDOMTree) {
        super(e, tree);
        this.emitted = false;
    }
    public setOnMapWrapper(map: PragueMapDOMData, tree: PragueFlatMapDOMTree): number {
        if (this.emitted) { return this.nodeId; }
        this.nodeId = map.addNodeData();
        map.setNodeData(this.nodeId, "tagName", this.getTagName());

        if (this.needExplicitNS()) {
            map.setNodeData(this.nodeId, "namespaceURI", this.element.namespaceURI);
        }
        this.setScrollPosOnPragueFlatMap(map);

        this.attributeId = map.addNodeData();
        map.setNodeData(this.nodeId, "attributes", this.attributeId);

        this.forEachOriginalNodeAttribute((key: string, value: string) => {
            this.setAttributeOnPragueFlatMap(map, key, value);
        });

        this.setChildListOnPragueFlatMap(map, tree);

        this.setEmitted(map);
        tree.notifyElementEmitted(this.element, this.nodeId, this.attributeId);
        return this.nodeId;
    }
    public setAttributeOnPragueFlatMap(map: PragueMapDOMData, key: string, value: string) {
        map.setNodeData(this.attributeId, key, value);
    }
    public setChildListOnPragueFlatMap(map: PragueMapDOMData, tree: PragueFlatMapDOMTree) {
        const childrenIds = [];
        this.forEachOriginalNodeChild((c) => {
            const child = c as IPragueFlatMapDOMNode;
            childrenIds.push(child.setOnMapWrapper(map, tree));
        });
        map.setNodeData(this.nodeId, "children", childrenIds);
    }
    public getNodeId() {
        return this.nodeId;
    }
    protected setEmitted(map: PragueMapDOMData) {
        this.emitted = true;
    }
    protected setScrollPosOnPragueFlatMap(map: PragueMapDOMData) {
        if (this.element.scrollTop || this.element.scrollLeft) {
            map.setNodeData(this.nodeId, "scrollPos",
                JSON.stringify([this.element.scrollLeft, this.element.scrollTop]));
        } else {
            map.deleteNodeData(this.nodeId, "scrollPos");
        }
    }
}

export class PragueFlatMapDOMTextNode extends RWDOM.RewriteDOMTextNode implements IPragueFlatMapDOMNode {
    protected nodeId: number;
    private emitted: boolean;
    constructor(n: Node) {
        super(n);
        this.emitted = false;
    }
    public setOnMapWrapper(map: PragueMapDOMData, tree: PragueFlatMapDOMTree): number {
        if (this.emitted) { return this.nodeId; }
        this.nodeId = map.addNodeData();
        this.setTextContentOnPragueFlatMap(map);
        tree.notifyNodeEmitted(this.node, this.nodeId);
        this.setEmitted(map);
        return this.nodeId;
    }
    protected setEmitted(map: PragueMapDOMData) {
        this.emitted = true;
    }
    protected setTextContentOnPragueFlatMap(map: PragueMapDOMData) {
        map.setNodeData(this.nodeId, "textContent", this.getTextContent());
    }
}

export class PragueFlatMapDOMTree extends RWDOM.RewriteDOMTree {
    public setOnMapWrapper(map: IMapViewWrapper) {
        const mapData = new PragueMapDOMData(map);
        this.getRootElement().setOnMapWrapper(mapData, this);
    }
    public getRootElement(): PragueFlatMapDOMElement {
        return this.rootElement as PragueFlatMapDOMElement;
    }
    public notifyNodeEmitted(node: Node, nodeId: number) {
        // Do nothing
    }
    public notifyElementEmitted(element: Element, nodeId: number, attributeId: number) {
        // Do nothing
    }
    protected createElementNode(e: Element): PragueFlatMapDOMElement {
        return new PragueFlatMapDOMElement(e, this);
    }
    protected createTextNode(n: Node): PragueFlatMapDOMTextNode {
        return new PragueFlatMapDOMTextNode(n);
    }
}
