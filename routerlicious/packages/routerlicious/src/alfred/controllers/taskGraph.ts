import * as api from "@prague/client-api";
import * as resources from "@prague/gitresources";
import { Browser, IClient } from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import * as d3 from "d3";
import { registerDocumentServices } from "./utils";

interface INode {
    label: string;  // Text inside the node.
    id: string; // Unique id for the node.
    group: number;
    radius: number;
    leader: boolean;
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
                .text((node: any) => node.label)
                .attr("font-size", (node: any) => node.group === 1 ? 18 : 14)
                .attr("dx", 0)
                .attr("dy", 0)
                .style("text-anchor", "middle")
                .style("font-weight", "bold")
                .style("font-style", (node: any) => node.leader ? "italic" : undefined);

    textElements = textEnter.merge(textElements);

    // texts
    clientElements = clientGroup.selectAll("text").data(graph.nodes, (node: any) => node.id);
    clientElements.exit().remove();

    const clientEnter = clientElements
        .enter()
            .append("text")
                .text((node: any) => node.group === 1 ? undefined : node.id)
                .attr("font-size", (node: any) => node.leader ? 16 : 14)
                .attr("dx", (node: any) => node.radius)
                .attr("dy", (node: any) => -(node.radius / 4))
                .style("font-weight", (node: any) => node.leader ? "bold" : "");

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
    registerDocumentServices(config);

    const tokenService = new socketStorage.TokenService();
    const claims = tokenService.extractClaims(token);

    const doc = await api.load(
        id,
        claims.tenantId,
        claims.user,
        token,
        { client: { type: "visualize" }, encrypted: false },
        version);
    let prev: IGraph;
    let curr = generateGraphData(doc);
    updateSimulation(curr);
    prev = curr;

    doc.on("clientLeave", () => {
        curr = generateGraphData(doc);
        if (!sameGraph(prev, curr)) {
            updateSimulation(curr);
            prev = curr;
        } else {
            console.log(`Same graph!`);
        }
    });

    doc.on("clientJoin", () => {
        curr = generateGraphData(doc);
        if (!sameGraph(prev, curr)) {
            updateSimulation(curr);
            prev = curr;
        } else {
            console.log(`Same graph!`);
        }
    });
}

function generateGraphData(document: api.Document): IGraph {
    const nodes: INode[] = [];
    const links: ILink[] = [];
    nodes.push({ label: document.id, id: document.id, group: 1, radius: 100, leader: false});
    let groupId = 1;
    const clients = document.getClients();
    const leaderId = getLeaderId(clients);
    for (const client of clients) {
        const leader = leaderId === client[0];
        const nodeType = (client[1] && client[1].type !== Browser) ?
            client[1].type : (leader ? "leader" : undefined);
        nodes.push({ label: nodeType, id: client[0], group: ++groupId, radius: leader ? 75 : 50, leader });
        links.push({ source: document.id, target: client[0], strength: 0.1});
    }
    const graph: IGraph = {
        links,
        nodes,
    };
    return graph;
}

function getLeaderId(clients: Map<string, IClient>) {
    const leader = api.getLeader(clients);
    return leader ? leader.clientId : undefined;
}

function sameNode(node1: INode, node2: INode): boolean {
    return (node1.label === node2.label &&
            node1.group === node2.group &&
            node1.id === node2.id &&
            node1.radius === node2.radius &&
            node1.leader === node2.leader);
}

function sameLink(link1: ILink, link2: ILink): boolean {
    return (link1.source === link2.source &&
            link1.strength === link2.strength &&
            link1.target === link2.target);
}

function sameGraph(prev: IGraph, curr: IGraph) {
    if (!prev) {
        return false;
    }
    if (prev.nodes.length !== curr.nodes.length ||
        prev.links.length !== curr.links.length) {
            return false;
    }
    for (let i = 0; i < prev.nodes.length; ++i) {
        if (!sameNode(prev.nodes[i], curr.nodes[i])) {
            return false;
        }
    }
    for (let i = 0; i < prev.links.length; ++i) {
        if (!sameLink(prev.links[i], curr.links[i])) {
            return false;
        }
    }

    return true;
}
