/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer, IHostLoader } from "@fluidframework/container-definitions";
import { ILoaderProps, Loader } from "@fluidframework/container-loader";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import type { IRequest, IResponse } from "@fluidframework/core-interfaces";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { create404Response, requestFluidObject } from "@fluidframework/runtime-utils";
import type { IDetachedModel, IModelLoader, ModelMakerCallback } from "./interfaces";

// This ModelLoader works on a convention, that the container it will load a model for must respond to a specific
// request format with the model object.  Here we export a helper function for those container authors to align to
// that contract -- the container author provides a ModelMakerCallback that will produce the model given a container
// runtime and container, and this helper will appropriately translate to/from the request/response format.

/**
 * A helper function for container authors, which generates the request handler they need to align with the
 * ModelLoader contract.
 * @param modelMakerCallback - A callback that will produce the model for the container
 * @returns A request handler that can be provided to the container runtime factory
 */
export const makeModelRequestHandler = <ModelType>(modelMakerCallback: ModelMakerCallback<ModelType>) => {
    return async (request: IRequest, runtime: IContainerRuntime): Promise<IResponse> => {
        // The model request format is for an empty path (i.e. "") and passing a reference to the container in the
        // header as containerRef.
        if (request.url === "" && request.headers?.containerRef !== undefined) {
            const container: IContainer = request.headers.containerRef;
            const model = await modelMakerCallback(runtime, container);
            return { status: 200, mimeType: "fluid/object", value: model };
        }
        return create404Response(request);
    };
};

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
        // load code just to check.  It might be desirable to add a supports() method to ICodeDetailsLoader.
        return true;
    }

    /**
     * The purpose of the model pattern and the model loader is to wrap the IContainer in a more useful object and
     * interface.  This demo uses a convention of requesting the default path and passing the container reference
     * in the request header.  It does this with the expectation that the model has been bundled with the container
     * code along with a request handler that will recognize this request format and return the model.
     * makeModelRequestHandler is provide to create exactly that request handler that the container author needs.
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
    public async createDetached(version: string): Promise<IDetachedModel<ModelType>> {
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
