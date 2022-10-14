
import { SharedPropertyTree, PropertyTreeFactory } from "@fluid-experimental/property-dds";
import { PropertyFactory, BaseProperty, NodeProperty } from "@fluid-experimental/property-properties";
import { DataBinder } from "@fluid-experimental/property-binder";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
import {
    AzureClient,
    ITelemetryBaseLogger,
    ITelemetryBaseEvent,
    AzureRemoteConnectionConfig
} from "@fluidframework/azure-client";


export async function registerSchema(schema: any) {
    PropertyFactory.register(Object.values([schema]));
}


export interface SimpleWorkspace {
    containerId: string;
    container: IFluidContainer,
    tree: SharedPropertyTree;
    dataBinder: DataBinder;
    rootProperty: NodeProperty;
    commit(): void;
    dispose(): void;
}

export class ReadyLogger implements ITelemetryBaseLogger {
    send(event: ITelemetryBaseEvent) {
        console.log(`Custom telemetry object array: ${JSON.stringify(event, null, 2)}`);
    }
}

export function getClient(userId: string, logger: ITelemetryBaseLogger): AzureClient {
    console.log(`ENV.FLUID_MODE is ${process.env.FLUID_MODE}`);
    switch (process.env.FLUID_MODE) {
        case "frs":
            const remoteConnectionConfig: AzureRemoteConnectionConfig = {
                type: 'remote',
                tenantId: process.env.SECRET_FLUID_TENANT!,
                tokenProvider: new InsecureTokenProvider(process.env.SECRET_FLUID_TOKEN!, {
                    id: userId,
                }),
                endpoint: process.env.SECRET_FLUID_RELAY!
            };
            console.log(`Connecting to ${process.env.SECRET_FLUID_RELAY}`);
            return new AzureClient({
                connection: remoteConnectionConfig,
                logger
            });
        case "router":  //guesswork, untested
            const routerConnectionConfig: AzureRemoteConnectionConfig = {
                type: 'remote',
                tenantId: "fluid",
                tokenProvider: new InsecureTokenProvider(
                    "create-new-tenants-if-going-to-production",
                    { id: userId }
                ),
                endpoint: "http://localhost:3003"
            };
            console.log(`Connecting to ${routerConnectionConfig.endpoint}`);
            return new AzureClient({
                connection: routerConnectionConfig,
                logger
            });
        default:
            console.log(`Connecting to http://localhost:7070`);
            return new AzureClient({
                connection: {
                    type: 'local',
                    tokenProvider: new InsecureTokenProvider("", {
                        id: userId,
                    }),
                    endpoint: "http://localhost:7070"
                },
                logger
            });
    }
}

export async function createSimpleWorkspace(containerId: string | undefined, treeClass: any, logger: ITelemetryBaseLogger | undefined = undefined): Promise<SimpleWorkspace> {

    const createNew = containerId === undefined;

    const containerSchema = {
        initialObjects: { tree: treeClass }
    };

    const client = getClient("benchmark", logger);

    let containerAndServices;

    if (createNew) {
        containerAndServices = await client.createContainer(containerSchema);
        containerId = await containerAndServices.container.attach();
    } else {
        containerAndServices = await client.getContainer(containerId, containerSchema);
        waitForFullyLoaded("root", containerAndServices.container);
    }

    const sharedTree = containerAndServices.container.initialObjects.tree as SharedPropertyTree;

    const dataBinder = new DataBinder();

    dataBinder.attachTo(sharedTree);

    return {
        "containerId": containerId,
        "container": containerAndServices.container,
        "tree": sharedTree,
        "dataBinder": dataBinder,
        "rootProperty": sharedTree.root,
        "commit": () => { sharedTree.commit() },
        "dispose": () => { containerAndServices.container.dispose() }
    }
}


function waitForFullyLoaded(userId: string, container: IFluidContainer) {
    const sharedTree = container.initialObjects.tree as SharedPropertyTree;
    sharedTree.commit({ userId, timestamp: Date.now() }, true);
    return new Promise((resolve) =>
        container.once("saved", () => resolve(undefined))
    );
}
