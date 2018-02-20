import { Provider } from "nconf";
import * as winston from "winston";
import * as api from "../api";
import * as core from "../core";
import { IMap, ISet } from "../data-types";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";

interface ISharedVertex {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
}

interface ISharedEdge {
    nodeId1: string;
    nodeId2: string;
    label: string;
}

class SharedGraph {
    constructor(public vertices: ISet<ISharedVertex>, public edges: ISet<ISharedEdge>) {
        for (const vertex of vertices.entries()) {
            winston.info(`${vertex.id} ${vertex.label}`);
        }
    }

    public addVertex(id: string, label: string, x: number, y: number, width: number, height: number) {
        this.vertices.add(<ISharedVertex> {
            height,
            id,
            label,
            width,
            x,
            y,
        });
    }

    public removeVertex(id: string) {
        for (const value of this.vertices.entries()) {
            if (value.id === id) {
                this.vertices.delete(value);
            }
        }
    }

    public addEdge(nodeId1: string, nodeId2: string, label: string) {
        this.edges.add(<ISharedEdge> {
            nodeId1,
            nodeId2,
            label,
        });
    }
}

class ServiceGraphLambda implements IPartitionLambda {
    constructor(baseGraph: IMap, private graph: SharedGraph, private context: IContext) {
        baseGraph.on("error", (error) => {
            winston.error(error);
            // Force exit for now on any error to cause a reconnect. But will want to return a promise
            // from the set operations to know when the operation completed. And then have a plan to
            // reconnect to the document.
            process.exit(1);
        });
    }

    public handler(message: utils.kafkaConsumer.IMessage): void {
        this.handleCore(message);
        this.context.checkpoint(message.offset);
    }

    private handleCore(message: utils.kafkaConsumer.IMessage) {
        const baseMessage = JSON.parse(message.value) as core.IMessage;
        if (baseMessage.type !== core.SystemType) {
            return;
        }

        const systemMessage = baseMessage as core.ISystemMessage;
        winston.info(`System message ${systemMessage.operation} from ${systemMessage.id}:${systemMessage.group}`);

        switch (core.SystemOperations[systemMessage.operation as string]) {
            case core.SystemOperations.Join:
                this.graph.addVertex(systemMessage.id, systemMessage.group, 0, 0, 100, 50);
                break;
            case core.SystemOperations.Leave:
                this.graph.removeVertex(systemMessage.id);
                break;
            default:
                break;
        }
    }
}

export class ServiceGraphLambdaFactory implements IPartitionLambdaFactory {
    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const alfred = config.get("paparazzi:alfred");

        const tenants = config.get("tenantConfig");
        let defaultTenant = tenants.find((tenant) => tenant.isDefault);
        if (!defaultTenant) {
            return Promise.reject("Could not find tenant information");
        }
        socketStorage.registerAsDefault(alfred, defaultTenant.url, defaultTenant.owner, defaultTenant.repository);

        const document = await api.load("__system__graph");
        const root = await document.getRoot().getView();

        // Initialize if it doesn't exist
        if (!root.has("graph")) {
            const graph = document.createMap();
            graph.createSet("vertices");
            graph.createSet("edges");
            root.set("graph", graph);
        }

        const graph = root.get("graph");
        const view = await graph.getView();
        const vertexSet: ISet<ISharedVertex> = view.get("vertices");
        const edgeSet: ISet<ISharedEdge> = view.get("edges");
        const sharedGraph = new SharedGraph(vertexSet, edgeSet);

        return new ServiceGraphLambda(graph, sharedGraph, context);
    }

    public async dispose(): Promise<void> {
        // TODO will want the ability to flush/close the document
        return;
    }
}
