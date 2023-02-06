/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ISharedTree,
    rootFieldKeySymbol,
    SharedTreeFactory,
    singleTextCursor,
    TransactionResult,
} from "@fluid-internal/tree";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { AppState } from "./appState";
// eslint-disable-next-line import/no-internal-modules
import { appStateSchema, appStateSchemaData } from "./schema";

export class Bubblebench extends DataObject {
    public static get Name() {
        return "@fluid-example/bubblebench-sharedtree";
    }
    private maybeTree?: ISharedTree = undefined;
    private maybeAppState?: AppState = undefined;
    static treeFactory = new SharedTreeFactory();


    protected async initializingFirstTime() {
        this.maybeTree = this.runtime.createChannel(
            undefined,
            Bubblebench.treeFactory.type
        ) as ISharedTree;

        this.initializeTree(this.maybeTree);
        this.root.set("unqiue-bubblebench-key-1337", this.maybeTree.handle);
    }

    protected async initializingFromExisting() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.maybeTree = await this.root
            .get<IFluidHandle<ISharedTree>>("unqiue-bubblebench-key-1337")!
            .get();
    }

    protected async hasInitialized() {
        if (this.tree === undefined) {
            throw new Error(
                "hasInitialized called but tree is still undefined",
            );
        }
        this.maybeAppState = new AppState(
            this.tree,
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

    initializeTree(tree: ISharedTree) {
        // initialize the schema of the shared tree to that of the Bubblebench AppState
        tree.storedSchema.update(appStateSchemaData);

        // Apply an edit to the tree which inserts a node with
        // the initial AppState as the root of the tree
        tree.runTransaction((forest, editor) => {
            // This cursor contains the initial state of the root of the
            // bubblebench shared tree as a JsonableTree
            const writeCursor = singleTextCursor({
                type: appStateSchema.name,
                fields: {
                    clients: [],
                },
            });
            const field = editor.sequenceField(
                undefined,
                rootFieldKeySymbol,
            );
            field.insert(0, writeCursor);
            return TransactionResult.Apply;
        });
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
