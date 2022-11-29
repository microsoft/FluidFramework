/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISharedTree, SharedTreeFactory, singleTextCursor } from "@fluid-internal/tree";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { AppState } from "./AppState";
import { AppStateSchema, AppStateSchemaData, AppStateTreeProxy } from "./schema";

export class Bubblebench extends DataObject {
    public static get Name() {
        return "@fluid-example/bubblebench-sharedtree";
    }
    private maybeTree?: ISharedTree = undefined;
    private maybeAppState?: AppState = undefined;
    static treeFactory = new SharedTreeFactory();

    protected async initializingFirstTime() {
        this.maybeTree = this.runtime.createChannel(
            "unique-bubblebench-key-1337",
            Bubblebench.treeFactory.type
        ) as ISharedTree;

        this.initializeTree(this.maybeTree);

        // This line will fail with the error 0x17b /* "Channel to be binded should be in not bounded set" */);
        this.root.set("unique-bubblebench-key-1337", this.maybeTree.handle);
    }

    protected async initializingFromExisting() {
        // console.log("existing initialization called, delaying tree connection for 3 seconds");
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.maybeTree = await this.root
            .get<IFluidHandle<ISharedTree>>("unique-bubblebench-key-1337")!
            .get();
    }

    protected async hasInitialized() {
        if (this.tree === undefined) {
            throw new Error(
                "hasInitialized called but tree is still undefined",
            );
        }
        this.maybeAppState = new AppState(
            this.tree.root as AppStateTreeProxy,
            /* stageWidth: */ 640,
            /* stageHeight: */ 480,
            /* numBubbles: */ 1,
        );

        const onConnected = () => {
            // Out of paranoia, we periodically check to see if your client Id has changed and
            // update the tree if it has.
            setInterval(() => {
                const clientId = this.runtime.clientId;
                if (
                    clientId !== undefined &&
                    clientId !== this.appState.localClient.clientId
                ) {
                    this.appState.localClient.clientId = clientId;
                }
            }, 1000);
        };

        // Wait for connection to begin checking client Id.
        if (this.runtime.connected) {
            onConnected();
        } else {
            this.runtime.once("connected", onConnected);
        }
    }

    /**
     * Initialize the schema of the shared tree to that of the Bubblebench AppState
     * and inserts a node with the initial AppState as the root of the tree.
     * @param tree - ISharedTree
     */
    initializeTree(tree: ISharedTree) {
        tree.storedSchema.update(AppStateSchemaData);
        const initialRootNodeJson = {
            type: AppStateSchema.name,
            fields: {
                clients: [],
            },
        };
        tree.context.root.insertNodes(0, [initialRootNodeJson].map(singleTextCursor));
    }

    private get tree() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.maybeTree!;
    }

    public get appState() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.maybeAppState!;
    }
}

/**
 * The DataObjectFactory declares the Fluid object and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const BubblebenchInstantiationFactory = new DataObjectFactory(
    Bubblebench.Name,
    Bubblebench,
    [new SharedTreeFactory()], // Is this correct?
    {},
);
