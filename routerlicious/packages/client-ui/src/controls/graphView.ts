import { api, graph, map, types } from "@prague/client-api";
import * as d3 from "d3";
import * as cola from "webcola";
import { Link, Node } from "webcola";
import * as ui from "../ui";

/**
 * Basic collaborative Graph Editor
 */
export class Graph extends ui.Component {
    public graph: types.IGraph;
    public graphMapView: types.IMapView;
    private svg: any;
    private d3Graph: any;

    private nodes: Node[];
    private links: Array<Link<number | Node>>;

    constructor(element: HTMLDivElement, doc: api.Document, public graphMap: types.IMap) {
        super(element);

        element.appendChild(document.getElementById("node-form"));
        const addNodeButton = element.getElementsByClassName("add-node-button")[0] as HTMLButtonElement;
        const inputNode = element.getElementsByClassName("node-id-input")[0] as HTMLInputElement;
        addNodeButton.onclick = () => this.addVertexTo(Number(inputNode.value));

        this.svg = d3.select(element).append("svg");

        this.d3Graph = cola.d3adaptor(d3)
            .symmetricDiffLinkLengths(50);

        this.graphHandler(graphMap, doc, element);
    }

    public async addVertexTo(nodeId1: number) {
        const cur = this.graph.getVertices().entries().length;

        this.graph.addVertex(cur, "node-" + cur);
        this.graph.addEdge(nodeId1, cur, "1-" + cur);
    }

    protected resizeCore(bounds: ui.Rectangle) {
        const width = bounds.width;
        const height = bounds.height;

        this.svg
            .attr("width", width)
            .attr("height", height);

        this.d3Graph
            .size([width, height]);
    }

    private async graphHandler(root: types.IMap, doc: api.Document, element: HTMLDivElement) {
        this.graphMapView = await root.getView();

        this.fetchGraph(root, doc);

        if (this.nodes === undefined || this.links === undefined) {
            this.nodes = [];
            this.links = [];
        }

        for (const edge of this.graph.getEdges().entries()) {
            this.links.push({source: edge.nodeId1, target: edge.nodeId2, weight: 1});
        }
        for (const node of this.graph.getVertices().entries()) {
            this.nodes.push(node);
        }

        this.startGraph();
        this.bindGraph(element);
    }

    private bindGraph(element: HTMLDivElement) {

        this.graphMap.on("setElementAdded", async (update) => {
            if ((update.value.label as string).indexOf("node") >= 0) {
                const vertex = update.value as graph.Vertex;
                this.nodes.push(this.toNode(vertex));
            } else {
                const edge = update.value as graph.Edge;
                this.links.push(this.toEdge(edge));
            }

            this.startGraph();
        });
    }

    private startGraph() {

        this.d3Graph
            .nodes(this.nodes)
            .links(this.links);

        // Lets try to bind to the elements on the SVG
        this.svg.selectAll(".link")
            .data(this.links,
                (curLink: Link<any>) => curLink.source.id + "-" + curLink.target.id )
            .enter().append("line")
            .attr("class", "link")
            .attr("x1", (curLink: Link<any>) => {
                return (curLink.source.x) ? curLink.source.x : this.nodes[curLink.source].x; })
            .attr("y1", (curLink: Link<any>) => {
                return (curLink.source.y) ? curLink.source.y : this.nodes[curLink.source].y; })
            .attr("x2", (curLink: Link<any>) => {
                return (curLink.target.x) ? curLink.target.x : this.nodes[curLink.target].x; })
            .attr("y2", (curLink: Link<any>) => {
                return (curLink.target.y) ? curLink.target.y : this.nodes[curLink.target].y; });

        this.svg.selectAll(".node")
            .data(this.nodes)
            .enter().append("circle")
            .attr("class", "node")
            .attr("r", 10)
            .on("click", (curNode) => { curNode.fixed = true; })
            .call(this.d3Graph.drag);

        this.d3Graph.start()
            .on("tick", () => {this.onTick(); });
    }

    private onTick() {
        this.svg.selectAll(".node")
            .attr("cx", (curNode: Node) => curNode.x)
            .attr("cy", (curNode: Node) => curNode.y);
        this.svg.selectAll(".link")
            .attr("x1", (curLink: Link<any>) => curLink.source.x)
            .attr("y1", (curLink: Link<any>) => curLink.source.y)
            .attr("x2", (curLink: Link<any>) => curLink.target.x)
            .attr("y2", (curLink: Link<any>) => curLink.target.y)
            .attr("stroke-width", 1)
            .attr("stroke", "black");
    }

    private fetchGraph(root: types.IMap, doc: api.Document) {

        const hasEdge = this.graphMapView.has("edge");

        if (!hasEdge) {
            this.graph = new graph.CollaborativeGraph(
                root.set<map.DistributedSet<graph.Edge>>("edge", undefined, map.DistributedSetValueType.Name),
                root.set<map.DistributedSet<graph.Vertex>>("vertex", undefined, map.DistributedSetValueType.Name));

            // Seed the graph with edges
            this.graph.addVertex(0, "node-0");
            this.graph.addVertex(1, "node-1");
            this.graph.addEdge(0, 1, "0-1");
        } else {
            this.graph = new graph.CollaborativeGraph(this.graphMapView.get("edge"), this.graphMapView.get("vertex"));
        }
    }

    private toEdge(edge: graph.Edge): Link<any> {
        const link = {
            length: 1,
            source: edge.nodeId1,
            target: edge.nodeId2,
            value: 2,
        } as Link<any>;

        return link;
    }

    private toNode(vertex: graph.Vertex): Node {
        const inputNode = {
            index: vertex.id,
        };
        return inputNode as Node;
    }
}
