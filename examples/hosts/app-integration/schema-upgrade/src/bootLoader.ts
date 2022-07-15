/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
    IContainer,
    IFluidCodeDetails,
    IFluidModuleWithDetails,
    IHostLoader,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";
import { MountableView } from "@fluidframework/view-adapters";
import { IFluidMountableView } from "@fluidframework/view-interfaces";

import React from "react";

import { App } from "./app";
import { AppView } from "./appView";
import { IApp, IBootLoader, IBootLoaderEvents, IMigratable, MigrationState } from "./interfaces";
import { TinyliciousService } from "./tinyliciousService";
import {
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory1,
} from "./version1";
import {
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory2,
} from "./version2";

interface ICodePackage<T> {
    fluidModuleWithDetails: IFluidModuleWithDetails;
    getModel: (container: IContainer) => T;
    getView: (model: T) => IFluidMountableView;
}

const v1Code: ICodePackage<IApp> = {
    fluidModuleWithDetails: {
        module: { fluidExport: new InventoryListContainerRuntimeFactory1() },
        details: { package: "one" },
    },
    getModel: (container: IContainer) => {
        return new App(container);
    },
    getView: (model: IApp) => {
        const reactView = React.createElement(AppView, { app: model });
        return new MountableView(reactView);
    },
};

const v2Code: ICodePackage<IApp> = {
    fluidModuleWithDetails: {
        module: { fluidExport: new InventoryListContainerRuntimeFactory2() },
        details: { package: "two" },
    },
    getModel: (container: IContainer) => {
        return new App(container);
    },
    getView: (model: IApp) => {
        const reactView = React.createElement(AppView, { app: model });
        return new MountableView(reactView);
    },
};

// Return ICodePackage<IApp1> | ICodePackage<IApp2> ?
const getCode = (version: string): ICodePackage<IApp> => {
    switch (version) {
        case "one": return v1Code;
        case "two": return v2Code;
        default: throw new Error("Unknown version");
    }
};

function createLoader(): IHostLoader {
    const tinyliciousService = new TinyliciousService();

    const load = async (source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
        if (typeof source.package !== "string") {
            throw new Error("Unexpected code detail format");
        }
        return getCode(source.package).fluidModuleWithDetails;
    };
    const codeLoader = { load };

    return new Loader({
        urlResolver: tinyliciousService.urlResolver,
        documentServiceFactory: tinyliciousService.documentServiceFactory,
        codeLoader,
    });
}

const getContainerId = (container: IContainer) => {
    const resolved = container.resolvedUrl;
    ensureFluidResolvedUrl(resolved);
    return resolved.id;
};

export class BootLoader extends TypedEventEmitter<IBootLoaderEvents> implements IBootLoader {
    private readonly loader: IHostLoader = createLoader();

    public async createNew(externalData?: string): Promise<{ app: IApp; id: string; }> {
        const container = await this.loader.createDetachedContainer({ package: "one" });
        const app = new App(container);
        await app.initialize(externalData);
        await container.attach(createTinyliciousCreateNewRequest());
        const id = getContainerId(container);
        return { app, id };
    }

    public async loadExisting(id: string): Promise<IApp> {
        const container = await this.loader.resolve({ url: id });
        // Here need to verify the correct App to wrap the container in
        const app = new App(container);
        await app.initialize();
        return app;
    }

    public async ensureMigrated(app: IMigratable) {
        const acceptedCodeDetails = app.acceptedCodeDetails;
        if (acceptedCodeDetails === undefined) {
            throw new Error("Cannot ensure migrated before code details are accepted");
        }
        const extractedData = await app.exportStringData();
        // Possibly transform the extracted data here
        const newContainer = await this.loader.createDetachedContainer(acceptedCodeDetails);
        const newApp = new App(newContainer);
        await newApp.initialize(extractedData);

        // Before attaching, let's check to make sure no one else has already done the migration
        // To avoid creating unnecessary extra containers.
        if (app.getMigrationState() === MigrationState.ended) {
            return;
        }

        // TODO: Maybe need retry here.
        // TODO: Use TaskManager here to reduce container noise.
        await newContainer.attach(createTinyliciousCreateNewRequest());
        // Discover the container ID after attaching
        const containerId = getContainerId(newContainer);

        // Again, it could be the case that someone else finished the migration during our attach.
        if (app.getMigrationState() === MigrationState.ended) {
            return;
        }

        // TODO: Maybe need retry here.
        app.finalizeMigration(containerId);
        // Here we let the newly created container/app fall out of scope intentionally.
        // If we don't win the race to set the container, it is the wrong container/app to use anyway
        // And the loader is probably caching the container anyway too.
    }

    public async getMigrated(oldApp: IMigratable): Promise<{ app: IApp; id: string; }> {
        if (oldApp.getMigrationState() !== MigrationState.ended) {
            throw new Error("Tried to get migrated container but migration hasn't happened yet");
        }
        const newContainerId = oldApp.newContainerId;
        if (newContainerId === undefined) {
            throw new Error("Migration ended without a new container being created");
        }
        const newContainer = await this.loader.resolve({ url: newContainerId });
        const app = new App(newContainer);
        await app.initialize();
        return { app, id: newContainerId };
    }
}
