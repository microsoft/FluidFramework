/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SerializedChangeSet, SharedPropertyTree, PropertyTreeFactory } from "@fluid-experimental/property-dds";
import { ISharedDirectory, SharedDirectory } from "@fluidframework/map";
import { IRequest, IResponse} from "@fluidframework/core-interfaces";
import { LazyLoadedDataObject, LazyLoadedDataObjectFactory } from "@fluidframework/data-object-base";

export interface IPropertyTree extends EventEmitter {
    readonly changeSet : SerializedChangeSet;
    pset : any;

    on(event: "changeSetModified" | "commit", listener: (CS : any) => void): this;

    stopTransmission(stopped : boolean) : void;

    commit() : void;
}

// The root is map-like, so we'll use this key for storing the value.
const propertyKey = "propertyKey";

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class PropertyTree extends LazyLoadedDataObject<ISharedDirectory> implements IPropertyTree {
    private _tree?: SharedPropertyTree;
    private _queryString : string | undefined;


    stopTransmission(stopped : boolean) : void {
        this._tree?.stopTransmission(stopped);
    }

    /**
     * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
     * DataObject, by registering an event listener for dice rolls.
     */
    protected async initialize() {
        if (this.runtime.existing) {
            const treeHandle = await this.root.wait<IFluidHandle<SharedPropertyTree>>(propertyKey)
            if (this._queryString !== undefined) {
                treeHandle.absolutePath += '?' + this._queryString;
            }
            this._tree = await treeHandle.get();
        } else {
            if (this._tree === undefined) {
                this.root.set(propertyKey, SharedPropertyTree.create(this.runtime, undefined,  this._queryString).handle);
                this._tree = await this.root.get<IFluidHandle<SharedPropertyTree>>(propertyKey)?.get();
            }
        }

        this.tree.on("localModification", (changeSet: any) => {
            this.emit("changeSetModified", changeSet);
        });
    }

    private get tree() { return this._tree!; }

    public get changeSet() {
        return this.tree.changeSet;
    }

    public get pset() {
        return this.tree.root;
    }
    commit() {
        this.tree.commit();
        this.emit("commit");
    }

    resolvePath(path: string, options: any): any {
        return this.tree.root.resolvePath(path, options);
    }
    public static getFactory(): IFluidDataStoreFactory { return PropertyTreeInstantiationFactory; }

    public static async create(parentContext: IFluidDataStoreContext, props?: any) {
        //return PropertyTreeRoot.factory.create(parentContext, props);
        throw new Error('Not yet implemented');
    }

    public create() {
        /*this.initialize();*/
        console.log('A');
    }
    public async load() {
        /*this.initialize();*/
        console.log('B');
    }

    public async request(request: IRequest): Promise<IResponse> {
        const url = request.url;
        console.log(url)
        this._queryString = url.split("?")[1];
        await this.initialize();
        return super.request(request);
    }
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const PropertyTreeInstantiationFactory = new LazyLoadedDataObjectFactory<PropertyTree>(
    "property-tree",
    PropertyTree,
    SharedDirectory.getFactory(),
    [new PropertyTreeFactory()],
    []
);
