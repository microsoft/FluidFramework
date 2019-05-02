import { api as prague} from "@prague/routerlicious";
import * as mergeTree from "@prague/routerlicious/dist/merge-tree";
import * as Properties from "@prague/routerlicious/dist/merge-tree/properties";
import * as sharedString from "@prague/routerlicious/dist/shared-string";
import * as vis from "vis";

enum NodeType {
    Map,
    Simple,
    SharedString,
    TextSegment,
    MarkerSegment,
    PropBag,
}

interface INodeTypeSpec {
    key: string;
    value: any;
}

function getNodeTypeSpec(nodeType: NodeType): INodeTypeSpec {
    switch (nodeType) {
        case NodeType.Map:
            return {key: "Map", value: {shape: "ellipse"}};
        case NodeType.Simple:
            return {key: "Simple", value: {shape: "box", color: "#CCD1D1"}};
        case NodeType.SharedString:
            return {key: "SharedString", value: {shape: "ellipse", color: "#EBDEF0"}};
        case NodeType.TextSegment:
            return {key: "TextSegment", value: {shape: "box", color: "#D1F2EB"}};
        case NodeType.MarkerSegment:
            return {key: "MarkerSegment", value: {shape: "box", color: "#FCF3CF"}};
        case NodeType.PropBag:
            return {key: "PropBag", value: {shape: "box", color: "#F6DDCC"}};
    }
}

const sharedStringTextIncrement: number = 100;

export class Visualizer {
    private nodes: vis.DataSet;
    private edges: vis.DataSet;
    private globalOptions: any;
    private idNodeCur: number;
    private network: vis.Network;
    private rootMap: prague.types.IMap;
    constructor(root: prague.types.IMap) {
        this.rootMap = root;
        this.idNodeCur = 0;
        const rootNode = this.CreateNode(root.id, root.id, NodeType.Map, ""/*context*/);
        this.nodes = new vis.DataSet();
        this.nodes.add(rootNode);
        this.edges = new vis.DataSet();

        const container = document.getElementById("visualization");
        this.globalOptions = {
            edges: {
                shadow: true,
                width: 2,
            },
            interaction: {
                hover: true,
                navigationButtons: true,
              },
            layout: {
                hierarchical: {
                    direction: "UD",
                    sortMethod: "directed",
                },
            },
            nodes: {
                borderWidth: 2,
                shadow: true,
            },
            physics: {
                stabilization: {
                    enabled: true,
                    fit: true,
                    iterations: 180, // maximum number of iteration to stabilize
                    onlyDynamicEdges: false,
                    updateInterval: 10,
                },
            },
        };

        this.network = new vis.Network(container, {edges: this.edges, nodes: this.nodes}, this.globalOptions);
        const self = this;
        this.network.on("doubleClick", (params) => {
            self.HandleOnDoubleClickNode(params);
        });

        this.network.on("select", (params) => {
            self.HandleOnSelectNode(params);
        });

        const prevButton = document.getElementById("prevButton");
        const nextButton = document.getElementById("nextButton");

        prevButton.onclick = () => {
            self.HandleNavigation("previous");
        };

        nextButton.onclick = () => {
            self.HandleNavigation("next");
        };
        this.UpdateUI();
    }

    public async ExpandMapNode(map: prague.types.IMap, idParent: number, pathToParent: string) {
        const mapView = await map.getView();

        const handleMapChanges = (key: string, value: any) => {
            this.DeleteNodeWithKey(key, idParent);
            let type: NodeType;
            let label = key;
            if (!value) {
                type = NodeType.Simple;
            } else {
                if (value.type === "https://graph.microsoft.com/types/mergeTree") {
                    type = NodeType.SharedString;
                } else if (value.type === "https://graph.microsoft.com/types/map") {
                    type = NodeType.Map;
                } else {
                    label = key + ":" + JSON.stringify(value);
                    type = NodeType.Simple;
                }
            }
            const node = this.CreateNode(label, key, type, pathToParent + ":" + key);
            this.nodes.add(node);
            this.edges.add({from: idParent, to: node.id, arrows: "to"});
            console.log("from:" + idParent + " to:" + node.id + " label:" + label);
        };

        map.on("valueChanged", async (delta: prague.types.IValueChanged) => {
            const value = await map.get(delta.key);
            handleMapChanges(delta.key, value);
        });

        mapView.forEach((value, key) => {
            handleMapChanges(key, value);
        });
    }

    private DeleteNodeWithKey(key: string, idParent: number) {
        const connectedNodes = this.network.getConnectedNodes(idParent, "to");
        for (const connectedNodeId of connectedNodes) {
            if (this.nodes._data[connectedNodeId].key === key) {
                this.RemoveSubTree(this.nodes._data[connectedNodeId].id);
            }
        }
    }

    private ExpandSharedStringNode(sharedstringIn: sharedString.SharedString,
                                   idParent: number, parentPath: string,
                                   posFirst: number = 0, posLim: number = 100) {
        const segmentWindow = sharedstringIn.client.mergeTree.getCollabWindow();

        let posStartOfCurrentSegment = 0;
        let posLimOfCurrentSegment = 0;
        const handleSegments = (label: string, nodetype: NodeType, propBag: string) => {
            posLimOfCurrentSegment = posStartOfCurrentSegment + (nodetype === NodeType.TextSegment ? label.length : 1);
            if (Math.max(posStartOfCurrentSegment, posFirst) <= Math.min(posLimOfCurrentSegment, posLim)) {
                const node = this.CreateNode(label, label, nodetype, propBag) as any;
                node.title = "PosFirst = " + posStartOfCurrentSegment + ", PosLim = " + posLimOfCurrentSegment;
                this.nodes.add(node);
                this.edges.add({from: idParent, to: node.id, arrows: "to"});
                console.log("from:" + idParent + " to:" + node.id + " Label:" + label);

                const nodeSharedString = this.nodes._data[idParent];
                nodeSharedString.posFirst = posFirst;
                nodeSharedString.posLim = posLim;
            }
            posStartOfCurrentSegment = posLimOfCurrentSegment;
        };
        const createVisNodes = (segment: mergeTree.Segment, pos: number,
                                refSeq: number, clientId: number, segStart: number,
                                segEnd: number) => {
                if (segment instanceof mergeTree.TextSegment) {
                    const propBagContext = this.GetPropertyBagLabel(segment.properties);
                    handleSegments(segment.text, NodeType.TextSegment, propBagContext);
                } else if (segment instanceof mergeTree.Marker) {
                    const labels = segment.getTileLabels();
                    let label: string = "Tile";
                    if (labels.length > 0) {
                        label = labels[0];
                    }
                    const propBagContext = this.GetPropertyBagLabel(segment.properties);
                    handleSegments(label, NodeType.MarkerSegment, propBagContext);
                }
                return true;
            };
        sharedstringIn.client.mergeTree.mapRange({leaf: createVisNodes },
                                                 segmentWindow.currentSeq,
                                                 segmentWindow.clientId,
                                                 undefined);
    }

    private async GetCollabObject(pathParentFromRoot: string) {
        const pathNodes = pathParentFromRoot.split(":");
        let pathId: number = 0;
        let obj = this.rootMap;
        for (pathId = 1; pathId < pathNodes.length; pathId++) {
            obj = await obj.get(pathNodes[pathId]);
        }

        return obj;
    }

    private RemoveChildNodes(idNode: number) {
        const connectedNodes = this.network.getConnectedNodes(idNode, "to");
        for (const idConnectedNode of connectedNodes) {
            this.RemoveSubTree(idConnectedNode);
        }
    }

    private RemoveSubTree(idNode: number) {
        const connectedNodes = this.network.getConnectedNodes(idNode, "to");
        for (const idConnectedNode of connectedNodes) {
            this.RemoveSubTree(idConnectedNode);
        }
        this.nodes.remove({id: idNode});
    }

    private CreateNode(labelNode: string, keyNode: string,
                       nodeType: NodeType, pathToNode: string, widthMax: number = 170) {
        const idNode = this.getNextId();
        const nodeTypeObj = getNodeTypeSpec(nodeType);
        return {
            color: nodeTypeObj.value.color,
            context: pathToNode,
            id: idNode,
            key: keyNode,
            label: labelNode,
            nodeType,
            shape: nodeTypeObj.value.shape,
            widthConstraint: {
                maximum: widthMax,
            },
        };
    }

    private DisableNextPrevButtons(disable: boolean) {
        const nextElement = document.getElementById("nextButton") as HTMLInputElement;
        nextElement.disabled = disable;
        const prevElement = document.getElementById("prevButton") as HTMLInputElement;
        prevElement.disabled = disable;
    }

    private UpdateUI() {
        const selectedNodeIds = this.network.getSelectedNodes();

        const lblSharedStringNoSharedStringSelected = "No shared string node selected.";
        const lblSharedStringSelectedNode = "Selected shared string : ";
        const lblSharedStringSharedNotExpanded = "Double click to expand shared string node : ";

        if (selectedNodeIds.length === 0) {
            // No node is selected

            // Disable Buttons
            this.DisableNextPrevButtons(true);

            // Hide CP Range
            document.getElementById("lblCPRange").className = "hidden";
            // Show No SS Selected
            document.getElementById("lblSharedStringSelected").innerHTML = lblSharedStringNoSharedStringSelected;
            return;
        }

        const selectedNode = this.nodes._data[selectedNodeIds[0]];
        if (selectedNode.nodeType !== NodeType.SharedString) {
            // It's not a shared string node

            // Disable Buttons
            this.DisableNextPrevButtons(true);
            // Hide CP Range
            document.getElementById("lblCPRange").className = "hidden";
            // Show NO SS Selected
            document.getElementById("lblSharedStringSelected").innerHTML = lblSharedStringNoSharedStringSelected;
            return;
        }

        if (selectedNode.posFirst === undefined || selectedNode.posLim === undefined) {
            // It's not yet expanded

            // Disable Buttons
            this.DisableNextPrevButtons(true);
            // Hide CP Range
            document.getElementById("lblCPRange").className = "hidden";
            // Show 'Expand the SS by double clicking'
            document.getElementById("lblSharedStringSelected").innerHTML =
            lblSharedStringSharedNotExpanded + selectedNode.label;
            return;
        }

        // Else
        // Enable Buttons
        this.DisableNextPrevButtons(false);
        // Show CP range
        document.getElementById("lblCPRange").className = "";
        document.getElementById("lblCPRange").innerHTML = "PosFirst = "
        + selectedNode.posFirst + ", PosLim = " + selectedNode.posLim;
        // Show 'Selected SS'
        document.getElementById("lblSharedStringSelected").innerHTML = lblSharedStringSelectedNode + selectedNode.label;
    }

    private async HandleNavigation(action: string) {
        const selectedNodeIds = this.network.getSelectedNodes();
        console.assert(selectedNodeIds.length > 0);
        const selectedNodeId = selectedNodeIds[0];
        const selectedNode = this.nodes._data[selectedNodeId];

        console.assert(selectedNode.nodeType === NodeType.SharedString);

        const posFirst = selectedNode.posFirst;
        const posLim = selectedNode.posLim;

        if (posFirst === 0 && action === "previous") {
            console.log("Can't go back beyond 0");
            return;
        }

        const context = selectedNode.context;
        const sharedStringClicked = await this.GetCollabObject(context) as sharedString.SharedString;
        const lengthOfSharedString = sharedStringClicked.client.getLength();
        if (posLim >= lengthOfSharedString && action === "next") {
            console.log("Length of shared string : " + lengthOfSharedString + ". Can't go further than that");
            return;
        }

        this.RemoveChildNodes(selectedNodeId);

        const incrementPos = (action === "next" ? sharedStringTextIncrement : -sharedStringTextIncrement);
        this.ExpandSharedStringNode(sharedStringClicked, selectedNode.id,
                                    selectedNode.context, posFirst + incrementPos, posLim + incrementPos);

        this.UpdateUI();
    }

    private HandleOnSelectNode(params) {
        this.UpdateUI();
    }

    private async HandleOnDoubleClickNode(params) {
        // If node is not double clicked then no action required
        if (params.nodes.length === 0) {
            this.UpdateUI();
            return;
        }

        const idNode = params.nodes[0];
        const nodeClicked = this.nodes._data[idNode];
        const connectedNodes = this.network.getConnectedNodes(idNode, "to");
        if (connectedNodes.length > 0) {
            this.RemoveChildNodes(idNode);
            if (nodeClicked.nodeType === NodeType.SharedString) {
                nodeClicked.posFirst = undefined;
                nodeClicked.posLim = undefined;
            }
            this.UpdateUI();
            return;
        }

        switch (nodeClicked.nodeType) {
            case NodeType.SharedString:
                await this.HandleClickOnSharedStringNode(nodeClicked);
                break;
            case NodeType.Map:
                await this.HandleClickOnMap(nodeClicked);
                break;
            case NodeType.TextSegment:
            case NodeType.MarkerSegment:
                await this.HandleClickonTextOrMarkerSegment(nodeClicked);
                break;
            default:
                console.log(nodeClicked.nodeType);
        }
        this.UpdateUI();
    }

    private async HandleClickOnSharedStringNode(nodeClicked: any) {
        const context = nodeClicked.context;
        const sharedStringClicked = await this.GetCollabObject(context) as sharedString.SharedString;
        this.ExpandSharedStringNode(sharedStringClicked, nodeClicked.id, nodeClicked.context);
    }

    private getNextId() {
        return ++this.idNodeCur;
    }

    private async HandleClickOnMap(nodeClicked: any) {
        const context = nodeClicked.context;
        const mapObject = await this.GetCollabObject(context);
        this.ExpandMapNode(mapObject, nodeClicked.id, nodeClicked.context);
    }

    private HandleClickonTextOrMarkerSegment(nodeClicked: any) {
        const node = this.CreateNode(nodeClicked.context, nodeClicked.context, NodeType.PropBag, "", 500);
        this.nodes.add(node);
        this.edges.add({from: nodeClicked.id, to: node.id, arrows: "to"});
        console.log("from:" + nodeClicked.id + " to:" + node.id + " Label:" + nodeClicked.context);
        }

    private GetPropertyBagLabel(properties: Properties.PropertySet) {
        let labelPropertyBag: string = "";
        if (properties) {
            for (const key in properties) {
                if (properties[key]) {
                    labelPropertyBag += key;
                    labelPropertyBag += ":";
                    labelPropertyBag += properties[key];
                    labelPropertyBag += "\n";
                }
            }
        }
        return labelPropertyBag;
    }
}
