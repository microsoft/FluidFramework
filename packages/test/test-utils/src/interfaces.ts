/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCell } from "@fluidframework/cell";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISharedMap, SharedDirectory, SharedMap } from "@fluidframework/map";
import { IFluidDataStoreContext, IFluidDataStoreChannel } from "@fluidframework/runtime-definitions";
import { IFluidLoadable } from "@fluidframework/core-interfaces";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCounter } from "@fluidframework/counter";
import { Ink } from "@fluidframework/ink";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { TestFluidObjectFactory } from "./testFluidObject";

export interface IProvideTestFluidObject {
    readonly ITestFluidObject: ITestFluidObject;
}

export interface ITestFluidObject extends IProvideTestFluidObject, IFluidLoadable {
    root: ISharedMap;
    readonly runtime: IFluidDataStoreRuntime;
    readonly channel: IFluidDataStoreChannel;
    readonly context: IFluidDataStoreContext;
    getSharedObject<T = any>(id: string): Promise<T>;
}

interface DDSTypes {
    SharedCell: typeof SharedCell;
    SharedCounter: typeof SharedCounter;
    Ink: typeof Ink;
    SharedDirectory: typeof SharedDirectory;
    SharedMap: typeof SharedMap;
    SharedMatrix: typeof SharedMatrix;
    ConsensusQueue: typeof ConsensusQueue;
    ConsensusRegisterCollection: typeof ConsensusRegisterCollection;
    SharedString: typeof SharedString;
    SparseMatrix: typeof SparseMatrix;
}

export interface ContainerRuntimeApiType {
    version: string;
    ContainerRuntime: typeof ContainerRuntime;
    ContainerRuntimeFactoryWithDefaultDataStore: typeof ContainerRuntimeFactoryWithDefaultDataStore;
}

export interface DataRuntimeApiType {
    version: string;
    DataObject: typeof DataObject;
    DataObjectFactory: typeof DataObjectFactory;
    TestFluidObjectFactory: typeof TestFluidObjectFactory;
    dds: DDSTypes;
}
