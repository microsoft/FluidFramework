import * as d3 from "d3";
import * as resources from "gitresources";
import { api, socketStorage, types } from "../../client-api";

interface INode {
    clientId: string;
    id: string;
    group: number;
    radius: number;
}

interface ILink {
    source: string;
    target: string;
    strength: number;
    label: string;
}

interface IGraph {
    nodes: INode[];
    links: ILink[];
}

// svg setup
const w = window.innerWidth;
const h = window.innerHeight;

const svg = d3.select("body")
.append("svg")
.attr("width", w)
.attr("height", h);
const color = d3.scaleOrdinal(d3.schemePastel1);
const simulation: any = d3.forceSimulation()
    .force("charge", d3.forceManyBody().strength(-3000))
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

let linkElements;
let nodeElements;
let textElements;
let clientElements;

// we use svg groups to logically group the elements together
const linkGroup = svg.append("g").attr("class", "links");
const nodeGroup = svg.append("g").attr("class", "nodes");
const textGroup = svg.append("g").attr("class", "texts");
const clientGroup = svg.append("g").attr("class", "clients");

function updateGraph(graph: any) {
    // links
    linkElements = linkGroup.selectAll("line").data(graph.links, (link: any) => link.target.id + link.source.id);
    linkElements.exit().remove();

    const linkEnter = linkElements.enter()
        .append("line")
        .attr("stroke-width", 1)
        .attr("stroke", "rgba(50, 50, 50, 0.2)");

    linkElements = linkEnter.merge(linkElements);

    // nodes
    nodeElements = nodeGroup.selectAll("circle").data(graph.nodes, (node: any) => node.id);
    nodeElements.exit().remove();

    const nodeEnter = nodeElements
        .enter()
        .append("circle")
        .attr("r", (d: any) => d.radius)
        .attr("fill", (d: any) => color(d.group))
        .call(dragDrop);

    nodeElements = nodeEnter.merge(nodeElements);

    // texts
    textElements = textGroup.selectAll("text").data(graph.nodes, (node: any) => node.id);
    textElements.exit().remove();

    const textEnter = textElements
        .enter()
            .append("text")
                .text((node: any) => node.id)
                .attr("font-size", (node: any) => node.group === 1 ? 18 : 14)
                .attr("dx", 0)
                .attr("dy", 0)
                .style("text-anchor", "middle")
                .style("font-weight", "bold");

    textElements = textEnter.merge(textElements);

    // texts
    clientElements = clientGroup.selectAll("text").data(graph.nodes, (node: any) => node.id);
    clientElements.exit().remove();

    const clientEnter = clientElements
        .enter()
            .append("text")
                .text((node: any) => node.clientId)
                .attr("font-size", 14)
                .attr("dx", (node: any) => node.radius)
                .attr("dy", (node: any) => -(node.radius / 4));

    clientElements = clientEnter.merge(clientElements);
}

function updateSimulation(graph: any) {
    updateGraph(graph);

    simulation.nodes(graph.nodes).on("tick", () => {
        nodeElements.attr("cx", (node: any) => node.x).attr("cy", (node: any) => node.y);
        textElements.attr("x", (node: any) => node.x).attr("y", (node: any) => node.y);
        clientElements.attr("x", (node: any) => node.x).attr("y", (node: any) => node.y);
        linkElements
            .attr("x1", (link: any) => link.source.x)
            .attr("y1", (link: any) => link.source.y)
            .attr("x2", (link: any) => link.target.x)
            .attr("y2", (link: any) => link.target.y);
    });

    simulation.force("link").links(graph.links);
    simulation.alpha(0.5).restart();
}

export async function load(id: string, version: resources.ICommit, config: any, token?: string) {
    socketStorage.registerAsDefault(
        document.location.origin,
        config.blobStorageUrl,
        config.tenantId,
        config.trackError);
    const doc = await api.load(id, { client: { type: "robot" }, encrypted: false, token }, version);
    const taskMap = await getTaskMap(doc);
    const taskMapView = await taskMap.getView();
    let graph = generateGraphData(doc, id, taskMapView);
    updateSimulation(graph);

    taskMap.on("valueChanged", () => {
        graph = generateGraphData(doc, id, taskMapView);
        updateSimulation(graph);
    });

    doc.on("clientLeave", () => {
        graph = generateGraphData(doc, id, taskMapView);
        updateSimulation(graph);
    });
}

function generateGraphData(document: api.Document, docId: string, taskMapView: types.IMapView): IGraph {
    const nodes: INode[] = [];
    const links: ILink[] = [];
    nodes.push({ clientId: undefined, id: docId, group: 1, radius: 100});
    let groupId = 1;
    for (const task of taskMapView.keys()) {
        const clientId = taskMapView.get(task) as string;
        if (clientId) {
            const activeClient = document.getClients().has(clientId);
            if (activeClient) {
                nodes.push({ clientId, id: task, group: ++groupId, radius: 50 });
                links.push({ label: clientId, source: docId, target: task, strength: 0.1});
            }
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
