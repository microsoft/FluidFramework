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
import { IMigratable, IModelLoader } from "./interfaces";
import { TinyliciousService } from "./tinyliciousService";
import {
    InventoryListContainer as InventoryListContainer1,
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory1,
} from "./version1";
import {
    InventoryListContainer as InventoryListContainer2,
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

const getModel = async (container: IContainer): Promise<IMigratable> => {
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
            const model = new InventoryListContainer1(container);
            await model.initialize();
            return model;
        }
        case "two": {
            const model = new InventoryListContainer2(container);
            await model.initialize();
            return model;
        }
        default: throw new Error("Unknown version");
    }
};

// This ModelLoader specifically supports versions one and two.  Other approaches might have network calls to
// dynamically load in the appropriate model for unknown versions.
// It has a default constructor, but a more realistic usage of the pattern might take the same parameters as
// the Loader (urlResolver, documentServiceFactory, codeLoader) plus a modelCodeLoader that provides the getModel
// functionality.  TODO: Determine if this demo should do that.
export class ModelLoader implements IModelLoader {
    private readonly loader: IHostLoader = createLoader();

    // TODO: If I parameterize a modelCodeLoader, then the modelCodeLoader would implement this method.
    public async isVersionSupported(version: string): Promise<boolean> {
        return version === "one" || version === "two";
    }

    // Would be preferable to have a way for the customer to call service.attach(model) rather than returning an
    // attach callback here.
    // TODO: Figure out how the attach call looks with the service parameterized
    public async createDetached(
        version: "one" | "two",
    ): Promise<{ model: IMigratable; attach: () => Promise<string>; }> {
        const supported = await this.isVersionSupported(version);
        if (!supported) {
            throw new Error("Unknown accepted version");
        }
        const container = await this.loader.createDetachedContainer({ package: version });
        const model = await getModel(container);
        // The attach callback lets us defer the attach so the caller can do whatever initialization pre-attach,
        // without leaking out the loader, service, etc.  We also return the container ID here so we don't have
        // to stamp it on something that would rather not know it (e.g. the model).
        const attach = async () => {
            await container.attach(createTinyliciousCreateNewRequest());
            const resolved = container.resolvedUrl;
            ensureFluidResolvedUrl(resolved);
            return resolved.id;
        };
        return { model, attach };
    }

    public async loadExisting(id: string): Promise<IMigratable> {
        const container = await this.loader.resolve({ url: id });
        const model = await getModel(container);
        return model;
    }
}
