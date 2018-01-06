import { ISet } from "../data-types";
import { IEdge, IGraph, IMap, IVertex} from "../data-types/index";
import { DistributedSet } from "../map/set";

/**
 * Implementation of a map collaborative object
 */
export class CollaborativeGraph implements IGraph {
    private edges: DistributedSet<IEdge>;
    private vertices: DistributedSet<IVertex>;

    constructor(root?: IMap, edges?: DistributedSet<IEdge>, vertices?: DistributedSet<IVertex>) {
        let edgeList: IEdge[] = [];
        let vertexList: IVertex[] = [];

        this.edges = edges ? edges : root.createSet<IEdge>("edge", edgeList) as DistributedSet<Edge>;
        this.vertices = vertices ? vertices : root.createSet<IVertex>("vertex", vertexList) as DistributedSet<Vertex>;
    }

    public addVertex(id: number, label: string) {
        let v = new Vertex(id, label);
        this.vertices.add(v);
    }

    public addEdge(nodeId1: number, nodeId2: number, label: string) {
        let e = new Edge(nodeId1, nodeId2, label);
        this.edges.add(e);
    }

    public getVertices(): ISet<any> {
        return this.vertices;
    }

    public getEdges(): ISet<any> {
        return this.edges;
    }
}

export class Edge implements IEdge {
    constructor(public nodeId1: number, public nodeId2: number, public label: string) {}

    public toLink(): {
       source: number,
       target: number,
       value: number,
       length?: number,
    } {
       let link = {
            length: 1,
            source: this.nodeId1,
            target: this.nodeId2,
            value: 2,
       };
       return link;
    }
}

export class Vertex implements IVertex {
    constructor(public id: number, public label: string) {}

    public toInputNode(): {
        index?: number,
        x?: number,
        y?: number,
        width?: number,
        height?: number,
        fixed?: number} {

        let inputNode = {
            index: this.id,
        };
        return inputNode;
    }
}
