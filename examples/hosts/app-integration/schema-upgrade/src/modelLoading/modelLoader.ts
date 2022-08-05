/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IHostLoader,
} from "@fluidframework/container-definitions";
import { ILoaderProps, Loader } from "@fluidframework/container-loader";
import { IRequest } from "@fluidframework/core-interfaces";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { IModelCodeLoader, IModelLoader } from "./interfaces";

export class ModelLoader<ModelType> implements IModelLoader<ModelType> {
    private readonly loader: IHostLoader;
    private readonly modelCodeLoader: IModelCodeLoader<ModelType>;
    private readonly generateCreateNewRequest: () => IRequest;

    // TODO: See if there's a nicer way to parameterize the createNew request.
    public constructor(
        props: ILoaderProps
        & {
            modelCodeLoader: IModelCodeLoader<ModelType>;
            generateCreateNewRequest: () => IRequest;
        },
    ) {
        // TODO: Also probably pass through other loader props, they just don't matter for this demo.
        this.loader = new Loader({
            urlResolver: props.urlResolver,
            documentServiceFactory: props.documentServiceFactory,
            codeLoader: props.codeLoader,
        });
        this.modelCodeLoader = props.modelCodeLoader;
        this.generateCreateNewRequest = props.generateCreateNewRequest;
    }

    public async supportsVersion(version: string): Promise<boolean> {
        // TODO: To really answer the question of whether we support a given version, we would want to check both the
        // modelCodeLoader and also the codeLoader.  Consider what that might look like (e.g. augment codeLoader with
        // some supportsVersion call).
        return this.modelCodeLoader.supportsVersion(version);
    }

    // Would be preferable to have a way for the customer to call service.attach(model) rather than returning an
    // attach callback here.  TODO: See if this is achievable.
    public async createDetached(version: string): Promise<{ model: ModelType; attach: () => Promise<string>; }> {
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
            await container.attach(this.generateCreateNewRequest());
            const resolved = container.resolvedUrl;
            ensureFluidResolvedUrl(resolved);
            return resolved.id;
        };
        return { model, attach };
    }

    public async loadExisting(id: string): Promise<ModelType> {
        const container = await this.loader.resolve({ url: id });
        const model = await this.modelCodeLoader.getModel(container);
        return model;
    }
}
