/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Loader API
import { Loader } from "@fluidframework/container-loader";

// Driver API
import { DriverApi } from "@fluidframework/test-drivers";

// ContainerRuntime API
import { ContainerRuntime } from "@fluidframework/container-runtime";

// Data Runtime API
import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import { Ink } from "@fluidframework/ink";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { TestFluidObjectFactory } from "@fluidframework/test-utils";

// ContainerRuntime and Data Runtime API
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";

import * as semver from "semver";
import { pkgVersion } from "./packageVersion";
import { checkInstalled, ensureInstalled, getRequestedRange, loadPackage } from "./versionUtils";

// List of package that needs to be install for legacy versions
const packageList = [
    "@fluidframework/aqueduct",
    "@fluidframework/test-utils",
    "@fluidframework/container-loader",
    "@fluidframework/container-runtime",
    "@fluidframework/cell",
    "@fluidframework/counter",
    "@fluidframework/ink",
    "@fluidframework/map",
    "@fluidframework/matrix",
    "@fluidframework/ordered-collection",
    "@fluidframework/register-collection",
    "@fluidframework/sequence",
    "@fluidframework/local-driver",
    "@fluidframework/odsp-driver",
    "@fluidframework/routerlicious-driver",
];

export const ensurePackageInstalled =
    async (version: number | string, force: boolean) => ensureInstalled(getRequestedRange(version), packageList, force);

// Current versions of the APIs
const LoaderApi = {
    version: pkgVersion,
    Loader,
};

const ContainerRuntimeApi = {
    version: pkgVersion,
    ContainerRuntime,
    ContainerRuntimeFactoryWithDefaultDataStore,
};

const DataRuntimeApi = {
    version: pkgVersion,
    DataObject,
    DataObjectFactory,
    TestFluidObjectFactory,
    dds: {
        SharedCell,
        SharedCounter,
        Ink,
        SharedDirectory,
        SharedMap,
        SharedMatrix,
        ConsensusQueue,
        ConsensusRegisterCollection,
        SharedString,
        SparseMatrix,
    },
};

export function getLoaderApi(requested?: number | string): typeof LoaderApi {
    const requestedStr = getRequestedRange(requested);

    // If the current version satisfies the range, use it.
    if (semver.satisfies(pkgVersion, requestedStr)) {
        return LoaderApi;
    }

    const { version, modulePath } = checkInstalled(requestedStr);
    return {
        version,
        Loader: loadPackage(modulePath, "@fluidframework/container-loader").Loader,
    };
}

export function getContainerRuntimeApi(requested?: number | string): typeof ContainerRuntimeApi {
    const requestedStr = getRequestedRange(requested);
    if (semver.satisfies(pkgVersion, requestedStr)) {
        return ContainerRuntimeApi;
    }
    const { version, modulePath } = checkInstalled(requestedStr);
    return {
        version,
        ContainerRuntime: loadPackage(modulePath, "@fluidframework/container-runtime").ContainerRuntime,
        ContainerRuntimeFactoryWithDefaultDataStore:
            loadPackage(modulePath, "@fluidframework/aqueduct").ContainerRuntimeFactoryWithDefaultDataStore,
    };
}

export function getDataRuntimeApi(requested?: number | string): typeof DataRuntimeApi {
    const requestedStr = getRequestedRange(requested);
    if (semver.satisfies(pkgVersion, requestedStr)) {
        return DataRuntimeApi;
    }
    const { version, modulePath } = checkInstalled(requestedStr);
    return {
        version,
        DataObject: loadPackage(modulePath, "@fluidframework/aqueduct").DataObject,
        DataObjectFactory: loadPackage(modulePath, "@fluidframework/aqueduct").DataObjectFactory,
        TestFluidObjectFactory:
            loadPackage(modulePath, "@fluidframework/test-utils").TestFluidObjectFactory,
        dds: {
            SharedCell: loadPackage(modulePath, "@fluidframework/cell").SharedCell,
            SharedCounter: loadPackage(modulePath, "@fluidframework/counter").SharedCounter,
            Ink: loadPackage(modulePath, "@fluidframework/ink").Ink,
            SharedDirectory: loadPackage(modulePath, "@fluidframework/map").SharedDirectory,
            SharedMap: loadPackage(modulePath, "@fluidframework/map").SharedMap,
            SharedMatrix: loadPackage(modulePath, "@fluidframework/matrix").SharedMatrix,
            ConsensusQueue: loadPackage(modulePath, "@fluidframework/ordered-collection").ConsensusQueue,
            ConsensusRegisterCollection:
                loadPackage(modulePath, "@fluidframework/register-collection").ConsensusRegisterCollection,
            SharedString: loadPackage(modulePath, "@fluidframework/sequence").SharedString,
            SparseMatrix: loadPackage(modulePath, "@fluidframework/sequence").SparseMatrix,
        },
    };
}

export function getDriverApi(requested?: number | string): typeof DriverApi {
    const requestedStr = getRequestedRange(requested);

    // If the current version satisfies the range, use it.
    if (semver.satisfies(pkgVersion, requestedStr)) {
        return DriverApi;
    }

    const { version, modulePath } = checkInstalled(requestedStr);
    const localDriverApi: typeof DriverApi.LocalDriverApi = {
        version,
        LocalDocumentServiceFactory:
            loadPackage(modulePath, "@fluidframework/local-driver").LocalDocumentServiceFactory,
        LocalResolver: loadPackage(modulePath, "@fluidframework/local-driver").LocalResolver,
        createLocalResolverCreateNewRequest:
            loadPackage(modulePath, "@fluidframework/local-driver").createLocalResolverCreateNewRequest,
    };

    const odspDriverApi: typeof DriverApi.OdspDriverApi = {
        version,
        OdspDocumentServiceFactory: loadPackage(modulePath, "@fluidframework/odsp-driver").OdspDocumentServiceFactory,
        OdspDriverUrlResolver: loadPackage(modulePath, "@fluidframework/odsp-driver").OdspDriverUrlResolver,
        createOdspCreateContainerRequest:
            loadPackage(modulePath, "@fluidframework/odsp-driver").createOdspCreateContainerRequest,
        createOdspUrl: loadPackage(modulePath, "@fluidframework/odsp-driver").createOdspUrl,
    };

    const routerliciousDriverApi: typeof DriverApi.RouterliciousDriverApi = {
        version,
        RouterliciousDocumentServiceFactory:
            loadPackage(modulePath, "@fluidframework/routerlicious-driver").RouterliciousDocumentServiceFactory,
    };

    return {
        LocalDriverApi: localDriverApi,
        OdspDriverApi: odspDriverApi,
        RouterliciousDriverApi: routerliciousDriverApi,
    };
}
