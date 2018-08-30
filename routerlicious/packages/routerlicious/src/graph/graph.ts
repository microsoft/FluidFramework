import { IEdge, IGraph, ISet, IVertex} from "../data-types";

/**
 * Implementation of a map collaborative object
 */
export class CollaborativeGraph implements IGraph {
    private edges: ISet<IEdge>;
    private vertices: ISet<IVertex>;

    constructor(edges?: ISet<IEdge>, vertices?: ISet<IVertex>) {
        this.edges = edges;
        this.vertices = vertices;
    }

    public addVertex(id: number, label: string) {
        const v = new Vertex(id, label);
        this.vertices.add(v);
    }

    public addEdge(nodeId1: number, nodeId2: number, label: string) {
        const e = new Edge(nodeId1, nodeId2, label);
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
}

export class Vertex implements IVertex {
    constructor(public id: number, public label: string) {}
}
