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
import { IApp, IBootLoader, IBootLoaderEvents } from "./interfaces";
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

const getModel = async (container: IContainer) => {
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

export class BootLoader extends TypedEventEmitter<IBootLoaderEvents> implements IBootLoader {
    private readonly loader: IHostLoader = createLoader();

    // Would be preferable to have a way for the customer to call service.attach(app) rather than returning an
    // attach callback here.
    public async createDetached(
        version: "one" | "two",
        externalData?: string,
    ): Promise<{ app: IApp; attach: () => Promise<string>; }> {
        const container = await this.loader.createDetachedContainer({ package: version });
        const app = await getModel(container);
        if (externalData !== undefined) {
            await app.importStringData(externalData);
        }
        const attach = async () => {
            await container.attach(createTinyliciousCreateNewRequest());
            return getContainerId(container);
        };
        return { app, attach };
    }

    public async loadExisting(id: string): Promise<IApp> {
        const container = await this.loader.resolve({ url: id });
        const model = await getModel(container);
        return model;
    }
}
