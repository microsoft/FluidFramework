/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { ISharedTree, SharedTreeFactory } from "@fluid-internal/tree";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";
import {
    AzureClient,
} from "@fluidframework/azure-client";
import { IChannelFactory } from "@fluidframework/datastore-definitions";


class MySharedTree {
    public static getFactory(): IChannelFactory {
        return new SharedTreeFactory();
    }

    onDisconnect() {
        console.warn("disconnected");
    }
}

export async function initializeWorkspace(containerId: string | undefined): Promise<Workspace> {
    const createNew = containerId === undefined;
    const treeClass: any = MySharedTree;
    const containerSchema = {
        initialObjects: { tree: treeClass },
    };
    const azureClient = createAzureClient();
    let containerAndServices;
    if (createNew) {
        containerAndServices = await azureClient.createContainer(containerSchema);
        // eslint-disable-next-line no-param-reassign
        containerId = await containerAndServices.container.attach();
    } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        containerAndServices = await azureClient.getContainer(containerId!, containerSchema);
    }
    const sharedTree = containerAndServices.container.initialObjects.tree as ISharedTree;
    const workspacePromise = {
        containerId,
        tree: sharedTree,
    };
    return workspacePromise;
}

export interface Workspace {
    containerId: string | undefined;
    tree: ISharedTree;
}

function createAzureClient() {
    const myUser: any = {
        id: "miso",
        name: "miso",
    };
    return new AzureClient({
        connection: {
            type: "local",
            tokenProvider: new InsecureTokenProvider("abcd", myUser),
            endpoint: "http://localhost:7070",
        },
    });
}
