import * as d3 from "d3";
import * as cola from "webcola";
import { Link, Node } from "webcola";
import { api, types } from "../client-api";
import { IMap } from "../data-types/index";
import { CollaborativeGraph } from "../graph/index";
import * as ui from "../ui";

/**
 * Basic collaborative Graph Editor
 */
export class Graph extends ui.Component {
    public graph: types.IGraph;
    public graphMapView: types.IMapView;
    public curNode: number;
    private svg: any;
    private d3Graph: any;

    private nodes: Node[];
    private links: Array<Link<number | Node>>;

    constructor(element: HTMLDivElement, doc: api.Document, public graphMap: IMap) {
        super(element);

        this.curNode = 2;

        let width = 960;
        let height = 500;

        this.svg = d3.select(element).append("svg")
            .attr("width", width)
            .attr("height", height);

        // This is the graph setup...
        this.d3Graph = cola.d3adaptor(d3)
            .size([width, height])
            .symmetricDiffLinkLengths(50);

        this.fetchGraph(graphMap, doc);

        this.generateButtons(element);
    }

    public async addVertexToGraph() {
        this.graph.addVertex(this.curNode, "node-" + this.curNode);
        this.graph.addEdge(1, this.curNode, "1-" + this.curNode);
        this.curNode++;
    }

    public createGraph(element: HTMLDivElement) {

        this.startGraph();

        this.graphMap.on("setElementAdded", async (value) => {
            if ((value.value.label as string).indexOf("node") >= 0) {
                this.nodes.push({index: value.value.id} as Node);
            } else {
                this.links.push({source: value.value.nodeId1, target: value.value.nodeId2, weight: 1});
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
                (curLink: Link<any>) => {return curLink.source.id + "-" + curLink.target.id; } )
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
            .attr("cx", (curNode: Node) => {return curNode.x; })
            .attr("cy", (curNode: Node) => {return curNode.y; });
        this.svg.selectAll(".link")
            .attr("x1", (curLink: Link<any>) => {return curLink.source.x; })
            .attr("y1", (curLink: Link<any>) => {return curLink.source.y; })
            .attr("x2", (curLink: Link<any>) => {return curLink.target.x; })
            .attr("y2", (curLink: Link<any>) => {return curLink.target.y; })
            .attr("stroke-width", 1)
            .attr("stroke", "black");
    }

    private async fetchGraph(root: types.IMap, doc: api.Document) {
        this.graphMapView = await root.getView();
        const hasEdge = this.graphMapView.has("edge");

        if (this.nodes === undefined || this.links === undefined) {
            this.nodes = [];
            this.links = [];
        }

        if (!hasEdge) {
            this.graph = new CollaborativeGraph(root);

            // Seed the graph with edges
            this.graph.addVertex(0, "node-0");
            this.graph.addVertex(1, "node-1");
            this.graph.addEdge(0, 1, "0-1");
        } else {
            this.graph = new CollaborativeGraph(null, this.graphMapView.get("edge"), this.graphMapView.get("vertex"));

            for (let edge of this.graph.getEdges().internalSet) {
                this.links.push({source: edge.nodeId1, target: edge.nodeId2, weight: 1});
            }
            for (let node of this.graph.getVertices().internalSet as Set<Node>) {
                this.nodes.push(node);
            }
        }

        if (this.nodes.length === 0) {
            this.nodes.push({index: 1} as Node);
            this.nodes.push({index: 2} as Node);
        }
        if (this.links.length === 0) {
            this.links.push({source: 0, target: 1, weight: 1});
        }
    }

    private generateButtons(element: HTMLDivElement) {

        let vertexButton = document.createElement("button");
        vertexButton.onclick = () => this.addVertexToGraph();
        vertexButton.style.height = "30px";
        vertexButton.style.width = "120px";
        vertexButton.style.color = "blue";
        let vertexLabel = document.createElement("label");
        vertexLabel.textContent = "vertexButton";
        vertexButton.appendChild(vertexLabel);
        element.appendChild(vertexButton);

        let createGraph = document.createElement("button");
        createGraph.onclick = () => this.createGraph(element);
        createGraph.style.height = "50px";
        createGraph.style.width = "120px";
        createGraph.style.color = "blue";
        let graphLabel = document.createElement("label");
        graphLabel.textContent = "createGraph";
        createGraph.appendChild(graphLabel);
        element.appendChild(createGraph);
    }
}
