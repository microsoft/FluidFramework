/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainer,
    IFluidCodeDetails,
    IFluidModuleWithDetails,
    IHostLoader,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";
import { IApp, IModelLoader } from "./interfaces";
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

const getModel = async (container: IContainer) => {
    // Here I'm using the specified code details for convenience since it already exists (a real code proposal).
    // However, it could be reasonable to use an alternative in-container storage for the container type (e.g. a
    // standalone Quorum DDS).  The important thing is that we need a dependable way to discover the version of the
    // container, so ideally it remains constant across versions.
    const version = container.getSpecifiedCodeDetails()?.package;
    if (typeof version !== "string") {
        throw new Error("Unexpected code detail format");
    }

    switch (version) {
        case "one": {
            const model = new App1(container);
            await model.initialize();
            return model;
        }
        case "two": {
            const model = new App2(container);
            await model.initialize();
            return model;
        }
        default: throw new Error("Unknown version");
    }
};

export class ModelLoader implements IModelLoader {
    private readonly loader: IHostLoader = createLoader();

    // Would be preferable to have a way for the customer to call service.attach(app) rather than returning an
    // attach callback here.
    public async createDetached(
        version: "one" | "two",
        externalData?: string,
    ): Promise<{ model: IApp; attach: () => Promise<string>; }> {
        if (version !== "one" && version !== "two") {
            throw new Error("Unknown accepted version");
        }
        const container = await this.loader.createDetachedContainer({ package: version });
        const model = await getModel(container);
        if (externalData !== undefined) {
            await model.importStringData(externalData);
        }
        // The attach callback lets us defer the attach so the caller can do whatever initialization pre-attach
        // But without leaking out the loader, service, etc.  We also return the container ID here so we don't have
        // to stamp it on something that would rather not know it (e.g. the model).
        const attach = async () => {
            await container.attach(createTinyliciousCreateNewRequest());
            const resolved = container.resolvedUrl;
            ensureFluidResolvedUrl(resolved);
            return resolved.id;
        };
        return { model, attach };
    }

    public async loadExisting(id: string): Promise<IApp> {
        const container = await this.loader.resolve({ url: id });
        const model = await getModel(container);
        return model;
    }
}
