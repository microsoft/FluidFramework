import * as d3 from "d3";
import * as resources from "gitresources";
import { api, socketStorage, types } from "../../client-api";

interface INode {
    id: string;
    group: number;
    radius: number;
}

interface ILink {
    source: string;
    target: string;
    strength: number;
}

interface IGraph {
    nodes: INode[];
    links: ILink[];
}

const w = window.innerWidth;
const h = window.innerHeight;

const svg = d3.select("body")
.append("svg")
.attr("width", w)
.attr("height", h);

const color = d3.scaleOrdinal(d3.schemeCategory10);

const simulation: any = d3.forceSimulation()
    .force("charge", d3.forceManyBody().strength(-20))
    .force("center", d3.forceCenter(w / 2, h / 2))
    .force("link", d3.forceLink()
        .id((link: any) => link.id)
        .strength((link: any) => link.strength));

const dragDrop = d3
    .drag()
    .on("start", (node: any) => {
        node.fx = node.x;
        node.fy = node.y;
    })
    .on("drag", (node: any) => {
        simulation.alphaTarget(0.7).restart();
        node.fx = d3.event.x;
        node.fy = d3.event.y;
    })
    .on("end", (node: any) => {
        if (!d3.event.active) {
            simulation.alphaTarget(0);
        }
        node.fx = null;
        node.fy = null;
    });

function getNeighbors(node, links) {
    return links.reduce(
        (neighbors, link) => {
        if (link.target.id === node.id) {
            neighbors.push(link.source.id);
        } else if (link.source.id === node.id) {
            neighbors.push(link.target.id);
        }
        return neighbors;
        },
        [node.id],
    );
}

function isNeighborLink(node: any, link) {
    return link.target.id === node.id || link.source.id === node.id;
}

function getNodeColor(node, neighbors) {
    if (neighbors.indexOf(node.id)) {
      return node.group === 1 ? "blue" : "green";
    }
    return color(node.group);
}
function getTextColor(node, neighbors) {
    return neighbors.indexOf(node.id) ? "green" : "black";
}
function getLinkColor(node, link) {
    return isNeighborLink(node, link) ? "green" : "#E5E5E5";
}

function renderGraph(graph: any) {
    const nodeElements = svg.append("g")
        .selectAll("circle")
        .data(graph.nodes)
        .enter().append("circle")
        .attr("r", (d: any) => d.radius)
        .attr("fill", (d: any) => color(d.group))
        .call(dragDrop)
        .on("click", selectNode);

    const textElements = svg.append("g")
        .selectAll("text")
        .data(graph.nodes)
        .enter().append("text")
        .text((d: any) => d.id)
        .attr("font-size", 10)
        .attr("dx", 15)
        .attr("dy", 4);

    const linkElements = svg.append("g")
        .selectAll("line")
        .data(graph.links)
        .enter().append("line")
          .attr("stroke-width", 2)
          .attr("stroke", "#E5E5E5");

    function selectNode(selectedNode) {
        const neighbors = getNeighbors(selectedNode, graph.links);
        nodeElements.attr("fill", (node) => getNodeColor(node, neighbors));
        textElements.attr("fill", (node) => getTextColor(node, neighbors));
        linkElements.attr("stroke", (link) => getLinkColor(selectedNode, link));
    }

    simulation.nodes(graph.nodes).on("tick", () => {
        nodeElements
            .attr("cx", (node: any) => node.x)
            .attr("cy", (node: any) => node.y);
        textElements
            .attr("x", (node: any) => node.x)
            .attr("y", (node: any) => node.y);
        linkElements
            .attr("x1", (link: any) => link.source.x)
            .attr("y1", (link: any) => link.source.y)
            .attr("x2", (link: any) => link.target.x)
            .attr("y2", (link: any) => link.target.y);
        });
    simulation.force("link").links(graph.links);
}

export async function load(id: string, version: resources.ICommit, config: any, token?: string) {
    console.log(id);
    console.log(JSON.stringify(version));
    console.log(config);
    console.log(token);
    socketStorage.registerAsDefault(
        document.location.origin,
        config.blobStorageUrl,
        config.tenantId,
        config.trackError);
    const doc = await api.load(id, { client: { type: "robot" }, encrypted: false, token }, version);
    const taskMap = await getTaskMap(doc);
    const taskMapView = await taskMap.getView();
    const graph = generateGraphData(id, taskMapView);
    renderGraph(graph);
    /*
    taskMap.on("valueChanged", () => {
        graph = generateGraphData(id, taskMapView);
        renderGraph(graph);
    });*/
}

function generateGraphData(docId: string, taskMapView: types.IMapView): IGraph {
    const nodes: INode[] = [];
    const links: ILink[] = [];
    nodes.push({ id: docId, group: 1, radius: 20});
    let groupId = 1;
    for (const task of taskMapView.keys()) {
        const clientId = taskMapView.get(task);
        if (clientId) {
            nodes.push({ id: task, group: ++groupId, radius: 10});
            links.push({source: docId, target: task, strength: 0.000001});
        }
    }
    const graph: IGraph = {
        links,
        nodes,
    };
    return graph;
}

export async function getTaskMap(doc: api.Document): Promise<types.IMap> {
    const rootMapView = await doc.getRoot().getView();
    await waitForTaskMap(rootMapView);
    return await rootMapView.get("tasks") as types.IMap;
}

function waitForTaskMap(root: types.IMapView): Promise<void> {
    return new Promise<void>((resolve, reject) => pollTaskMap(root, resolve, reject));
}

function pollTaskMap(root: types.IMapView, resolve, reject) {
    if (root.has("tasks")) {
        resolve();
    } else {
        const pauseAmount = 50;
        console.log(`Did not find taskmap - waiting ${pauseAmount}ms`);
        setTimeout(() => pollTaskMap(root, resolve, reject), pauseAmount);
    }
}
