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
import { IApp, IBootLoader, IBootLoaderEvents, IMigratable, MigrationState } from "./interfaces";
import { TinyliciousService } from "./tinyliciousService";
import {
    App as App1,
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory1,
} from "./version1";
import {
    App as App2,
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory2,
} from "./version2";

const v1ModuleWithDetails: IFluidModuleWithDetails = {
    module: { fluidExport: new InventoryListContainerRuntimeFactory1() },
    details: { package: "one" },
};

const v2ModuleWithDetails: IFluidModuleWithDetails = {
    module: { fluidExport: new InventoryListContainerRuntimeFactory2() },
    details: { package: "two" },
};

const getModel = (container: IContainer) => {
    const version = container.getSpecifiedCodeDetails()?.package;
    if (typeof version !== "string") {
        throw new Error("Unexpected code detail format");
    }

    switch (version) {
        case "one": return new App1(container);
        case "two": return new App2(container);
        default: throw new Error("Unknown version");
    }
};

function createLoader(): IHostLoader {
    const tinyliciousService = new TinyliciousService();

    const load = async (source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
        const version = source.package;
        if (typeof version !== "string") {
            throw new Error("Unexpected code detail format");
        }
        switch (version) {
            case "one": return v1ModuleWithDetails;
            case "two": return v2ModuleWithDetails;
            default: throw new Error("Unknown version");
        }
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

// Split into BootLoader vs. Migrator?
export class BootLoader extends TypedEventEmitter<IBootLoaderEvents> implements IBootLoader {
    private readonly loader: IHostLoader = createLoader();

    // Would be preferable to have a way for the customer to call service.attach(app) rather than returning an
    // attach callback here.
    public async createDetached(
        version: "one" | "two",
        externalData?: string,
    ): Promise<{ app: IApp; attach: () => Promise<string>; }> {
        const container = await this.loader.createDetachedContainer({ package: version });
        const app = getModel(container);
        await app.initialize(externalData);
        const attach = async () => {
            await container.attach(createTinyliciousCreateNewRequest());
            return getContainerId(container);
        };
        return { app, attach };
    }

    public async loadExisting(id: string): Promise<IApp> {
        const container = await this.loader.resolve({ url: id });
        const model = getModel(container);
        await model.initialize();
        return model;
    }

    public async ensureMigrated(app: IMigratable) {
        const acceptedVersion = app.acceptedVersion;
        if (acceptedVersion === undefined) {
            throw new Error("Cannot ensure migrated before code details are accepted");
        }
        if (acceptedVersion !== "one" && acceptedVersion !== "two") {
            throw new Error("Unknown accepted version");
        }
        const extractedData = await app.exportStringData();
        // Possibly transform the extracted data here
        const { attach } = await this.createDetached(acceptedVersion, extractedData);
        // Maybe here apply the extracted data instead of passing it into createDetached

        // Before attaching, let's check to make sure no one else has already done the migration
        // To avoid creating unnecessary extra containers.
        if (app.getMigrationState() === MigrationState.ended) {
            return;
        }

        // TODO: Maybe need retry here.
        // TODO: Use TaskManager here to reduce container noise.
        const containerId = await attach();

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
}
