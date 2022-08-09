/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, IHostLoader } from "@fluidframework/container-definitions";
import { ILoaderProps, Loader } from "@fluidframework/container-loader";
import { IRequest } from "@fluidframework/core-interfaces";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IModelLoader } from "./interfaces";

export class ModelLoader<ModelType> implements IModelLoader<ModelType> {
    private readonly loader: IHostLoader;
    private readonly generateCreateNewRequest: () => IRequest;

    // TODO: See if there's a nicer way to parameterize the createNew request.
    public constructor(
        props: ILoaderProps
        & {
            generateCreateNewRequest: () => IRequest;
        },
    ) {
        // TODO: Also probably pass through other loader props, they just don't matter for this demo.
        this.loader = new Loader({
            urlResolver: props.urlResolver,
            documentServiceFactory: props.documentServiceFactory,
            codeLoader: props.codeLoader,
        });
        this.generateCreateNewRequest = props.generateCreateNewRequest;
    }

    public async supportsVersion(version: string): Promise<boolean> {
        // To answer the question of whether we support a given version, we would need to query the codeLoader
        // to see if it thinks it can load the requested version.  But for now, ICodeDetailsLoader doesn't have
        // a supports() method.  We could attempt a load and catch the error, but it might not be desirable to
        // load code just to check.  It might be desirable to add such a method to that interface.
        return true;
    }

    /**
     * The purpose of the model pattern and the model loader is to wrap the IContainer in a more useful object and
     * interface.  This demo uses a convention of requesting the default path and passing the container reference
     * in the request header.  It does this with the expectation that the model has been bundled with the container
     * code along with a request handler that will recognize this request format and return the model.
     *
     * Other strategies to obtain the wrapping model could also work fine here - for example a standalone model code
     * loader that separately fetches model code and wraps the container from the outside.
     */
    private async getModelFromContainer(container: IContainer) {
        return requestFluidObject<ModelType>(
            container,
            { url: "", headers: { containerRef: container } },
        );
    }

    // It would be preferable for attaching to look more like service.attach(model) rather than returning an attach
    // callback here, but this callback at least allows us to keep the method off the model interface.
    public async createDetached(version: string): Promise<{ model: ModelType; attach: () => Promise<string>; }> {
        const container = await this.loader.createDetachedContainer({ package: version });
        const model = await this.getModelFromContainer(container);
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
        const model = await this.getModelFromContainer(container);
        return model;
    }
}
