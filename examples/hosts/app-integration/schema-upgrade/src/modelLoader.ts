/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IHostLoader,
} from "@fluidframework/container-definitions";
import { ILoaderProps, Loader } from "@fluidframework/container-loader";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { createTinyliciousCreateNewRequest } from "@fluidframework/tinylicious-driver";
import { IMigratable, IModelCodeLoader, IModelLoader } from "./interfaces";

// This ModelLoader specifically supports versions one and two.  Other approaches might have network calls to
// dynamically load in the appropriate model for unknown versions.
// It has a default constructor, but a more realistic usage of the pattern might take the same parameters as
// the Loader (urlResolver, documentServiceFactory, codeLoader) plus a modelCodeLoader that provides the getModel
// functionality.  TODO: Determine if this demo should do that.
export class ModelLoader implements IModelLoader {
    private readonly loader: IHostLoader;
    private readonly modelCodeLoader: IModelCodeLoader;

    public constructor(props: ILoaderProps & { modelCodeLoader: IModelCodeLoader; }) {
        this.loader = new Loader({
            urlResolver: props.urlResolver,
            documentServiceFactory: props.documentServiceFactory,
            codeLoader: props.codeLoader,
        });
        this.modelCodeLoader = props.modelCodeLoader;
    }

    // TODO: Should this be exposed on the ModelLoader, vs. having the caller consult the modelCodeLoader directly?
    public async supportsVersion(version: string): Promise<boolean> {
        return this.modelCodeLoader.supportsVersion(version);
    }

    // Would be preferable to have a way for the customer to call service.attach(model) rather than returning an
    // attach callback here.
    // TODO: Figure out how the attach call looks with the service parameterized
    public async createDetached(version: string): Promise<{ model: IMigratable; attach: () => Promise<string>; }> {
        const supported = await this.modelCodeLoader.supportsVersion(version);
        if (!supported) {
            throw new Error("Unknown accepted version");
        }
        const container = await this.loader.createDetachedContainer({ package: version });
        const model = await this.modelCodeLoader.getModel(container);
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
        const model = await this.modelCodeLoader.getModel(container);
        return model;
    }
}
