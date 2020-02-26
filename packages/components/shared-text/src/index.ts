/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// eslint-disable-next-line import/no-unassigned-import
import "./publicpath";

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, IRuntime, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
    IHostRuntime,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import * as sharedTextComponent from "./component";

/* eslint-disable max-len */
const math = import(/* webpackChunkName: "math", webpackPrefetch: true */ "@fluid-example/math");
// const monaco = import(/* webpackChunkName: "monaco", webpackPrefetch: true */ "@fluid-example/monaco");
const progressBars = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */ "@fluid-example/progress-bars");
const videoPlayers = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */ "@fluid-example/video-players");
const images = import(
    /* webpackChunkName: "image-collection", webpackPrefetch: true */ "@fluid-example/image-collection");

const DefaultComponentName = "text";

// (self as any).MonacoEnvironment = {
// 	getWorkerUrl: function (moduleId, label) {
// 		switch (label) {
// 			case 'json': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/json/json.worker');
// 			case 'css': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/css/css.worker');
// 			case 'html': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/html/html.worker');
// 			case 'typescript':
// 			case 'javascript': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/typescript/ts.worker');
// 			default:
// 				return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/editor/editor.worker');
// 		}
// 	}
// };
/* eslint-enable max-len */

const defaultRegistryEntries: NamedComponentRegistryEntries = [
    ["@fluid-example/math", math.then((m) => m.fluidExport)],
    ["@fluid-example/progress-bars", progressBars.then((m) => m.fluidExport)],
    ["@fluid-example/video-players", videoPlayers.then((m) => m.fluidExport)],
    ["@fluid-example/image-collection", images.then((m) => m.fluidExport)],
];

class MyRegistry implements IComponentRegistry {
    constructor(
        private readonly context: IContainerContext,
        private readonly defaultRegistry: string) {
    }

    public get IComponentRegistry() { return this; }

    public async get(name: string): Promise<IComponentFactory> {
        const scope = `${name.split("/")[0]}:cdn`;
        const config = {};
        config[scope] = this.defaultRegistry;

        const codeDetails = {
            package: name,
            config,
        };
        const fluidModule = await this.context.codeLoader.load(codeDetails);
        return fluidModule.fluidExport.IComponentFactory;
    }
}

class SharedTextFactoryComponent implements IComponentFactory, IRuntimeFactory {

    public get IComponentFactory() { return this; }
    public get IRuntimeFactory() { return this; }

    /**
     * A request handler for a container runtime
     * @param request - The request
     * @param runtime - Container Runtime instance
     */
    private static async containerRequestHandler(request: IRequest, runtime: IHostRuntime) {
        console.log(request.url);

        //
        // if (request.url === "/graphiql") {
        //     const runner = (await runtime.request({ url: "/" })).value as sharedTextComponent.SharedTextRunner;
        //     const sharedText = await runner.getRoot().get<IComponentHandle>("text").get<SharedString>();
        //     return { status: 200, mimeType: "fluid/component", value: new GraphIQLView(sharedText) };
        // }

        console.log(request.url);
        const requestUrl = request.url.length > 0 && request.url.startsWith("/")
            ? request.url.substr(1)
            : request.url;
        const trailingSlash = requestUrl.indexOf("/");

        const componentId = requestUrl
            ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
            : "text";
        const component = await runtime.getComponentRuntime(componentId, true);

        return component.request(
            {
                headers: request.headers,
                url: trailingSlash === -1 ? "" : requestUrl.substr(trailingSlash),
            });
    }

    public instantiateComponent(context: IComponentContext): void {
        return sharedTextComponent.instantiateComponent(context);
    }

    /**
     * Instantiates a new chaincode host
     */
    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            [
                ...defaultRegistryEntries,
                ["@fluid-example/shared-text", Promise.resolve(this)],
                [
                    "verdaccio",
                    Promise.resolve(new MyRegistry(context, "https://pragueauspkn-3873244262.azureedge.net")),
                ],
            ],
            [SharedTextFactoryComponent.containerRequestHandler]);

        // On first boot create the base component
        if (!runtime.existing) {
            await Promise.all([
                runtime.createComponent(DefaultComponentName, "@fluid-example/shared-text")
                    .then((componentRuntime) => componentRuntime.attach()),
            ])
                .catch((error) => {
                    context.error(error);
                });
        }

        return runtime;
    }
}

export * from "./utils";

export const fluidExport = new SharedTextFactoryComponent();
