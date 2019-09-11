/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// tslint:disable-next-line:no-import-side-effect
import "./publicpath";

import { IRequest } from "@prague/component-core-interfaces";
import { IContainerContext, IRuntime, IRuntimeFactory } from "@prague/container-definitions";
import { ContainerRuntime, IComponentRegistry } from "@prague/container-runtime";
import { IComponentContext, IComponentFactory } from "@prague/runtime-definitions";
// import { SharedString } from "@prague/sequence";
import * as Snapshotter from "@prague/snapshotter";
import * as sharedTextComponent from "./component";
// import { GraphIQLView } from "./graphql";
import { waitForFullConnection } from "./utils";

const math = import(/* webpackChunkName: "math", webpackPrefetch: true */ "@chaincode/math");
// const monaco = import(/* webpackChunkName: "monaco", webpackPrefetch: true */ "@chaincode/monaco");
const pinpoint = import(/* webpackChunkName: "pinpoint", webpackPrefetch: true */ "@chaincode/pinpoint-editor");
const progressBars = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */ "@chaincode/progress-bars");
const videoPlayers = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */ "@chaincode/video-players");
const images = import(
    /* webpackChunkName: "image-collection", webpackPrefetch: true */ "@chaincode/image-collection");

const DefaultComponentName = "text";

// tslint:disable
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
// tslint:enable

class MyRegistry implements IComponentRegistry {
    constructor(private context: IContainerContext, private readonly sharedTextFactory: SharedTextFactoryComponent) {
    }

    public get IComponentRegistry() {return this; }

    public async get(name: string): Promise<IComponentFactory> {
        if (name === "@chaincode/shared-text") {
            return this.sharedTextFactory;
        } else if (name === "@chaincode/math") {
            return math.then((m) => m.fluidExport);
        } else if (name === "@chaincode/progress-bars") {
            return progressBars.then((m) => m.fluidExport);
        } else if (name === "@chaincode/video-players") {
            return videoPlayers.then((m) => m.fluidExport);
        } else if (name === "@chaincode/image-collection") {
            return images.then((m) => m.fluidExport);
        // } else if (name === "@chaincode/monaco") {
        //     return monaco.then((m) => m.fluidExport);
        } else if (name === "@chaincode/pinpoint-editor") {
            return pinpoint.then((m) => m.fluidExport);
        } else {
            return this.context.codeLoader.load<IComponentFactory>(name);
        }
    }
}

class SharedTextFactoryComponent implements IComponentFactory, IRuntimeFactory {

    public get IComponentFactory() { return this; }
    public get IRuntimeFactory() { return this; }

    public instantiateComponent(context: IComponentContext): void {
        return sharedTextComponent.instantiateComponent(context);
    }

    /**
     * Instantiates a new chaincode host
     */
    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const generateSummaries = true;

        const runtime = await ContainerRuntime.load(
            context,
            new MyRegistry(context, this),
            this.createContainerRequestHandler,
            { generateSummaries });

        // Registering for tasks to run in headless runner.
        if (!generateSummaries) {
            runtime.registerTasks(["snapshot", "spell", "translation", "cache"], "1.0");
            waitForFullConnection(runtime).then(() => {
                // Call snapshot directly from runtime.
                if (runtime.clientType === "snapshot") {
                    console.log(`@chaincode/shared-text running ${runtime.clientType}`);
                    Snapshotter.run(runtime);
                }
            });
        }

        // On first boot create the base component
        if (!runtime.existing) {
            await Promise.all([
                runtime.createComponent(DefaultComponentName, "@chaincode/shared-text")
                    .then((componentRuntime) => componentRuntime.attach()),
            ])
            .catch((error) => {
                context.error(error);
            });
        }

        return runtime;
    }

    /**
     * Add create and store a request handler as pat of ContainerRuntime load
     * @param runtime - Container Runtime instance
     */
    private createContainerRequestHandler(runtime: ContainerRuntime) {
        return async (request: IRequest) => {
            console.log(request.url);

            // if (request.url === "/graphiql") {
            //     const runner = (await runtime.request({ url: "/" })).value as sharedTextComponent.SharedTextRunner;
            //     const sharedText = await runner.getRoot().get<IComponentHandle>("text").get<SharedString>();
            //     return { status: 200, mimeType: "fluid/component", value: new GraphIQLView(sharedText) };
            // }

            console.log(request.url);
            const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
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
        };
    }
}

export * from "./utils";

export const fluidExport = new SharedTextFactoryComponent();
