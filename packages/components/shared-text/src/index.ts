/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// tslint:disable-next-line:no-import-side-effect
import "./publicpath";

// import { SharedString } from "@prague/sequence";
import * as Snapshotter from "@fluid-example/snapshotter-agent";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, IRuntime, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import {
    IComponentContext,
    IComponentFactory,
    IComponentRegistry,
    IHostRuntime,
} from "@microsoft/fluid-runtime-definitions";
import * as sharedTextComponent from "./component";
// import { GraphIQLView } from "./graphql";
import { waitForFullConnection } from "./utils";

const math = import(/* webpackChunkName: "math", webpackPrefetch: true */ "@fluid-example/math");
// const monaco = import(/* webpackChunkName: "monaco", webpackPrefetch: true */ "@fluid-example/monaco");
const pinpoint = import(/* webpackChunkName: "pinpoint", webpackPrefetch: true */ "@fluid-example/pinpoint-editor");
const progressBars = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */ "@fluid-example/progress-bars");
const videoPlayers = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */ "@fluid-example/video-players");
const images = import(
    /* webpackChunkName: "image-collection", webpackPrefetch: true */ "@fluid-example/image-collection");

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
    constructor(private context: IContainerContext,
                private readonly sharedTextFactory: SharedTextFactoryComponent,
                private readonly defaultRegistry: string) {
    }

    public get IComponentRegistry() {return this; }

    public async get(name: string, cdn?: string): Promise<IComponentFactory> {
        if (name === "@fluid-example/shared-text") {
            return this.sharedTextFactory;
        } else if (name === "@fluid-example/math") {
            return math.then((m) => m.fluidExport);
        } else if (name === "@fluid-example/progress-bars") {
            return progressBars.then((m) => m.fluidExport);
        } else if (name === "@fluid-example/video-players") {
            return videoPlayers.then((m) => m.fluidExport);
        } else if (name === "@fluid-example/image-collection") {
            return images.then((m) => m.fluidExport);
        // } else if (name === "@fluid-example/monaco") {
        //     return monaco.then((m) => m.fluidExport);
        } else if (name === "@fluid-example/pinpoint-editor") {
            return pinpoint.then((m) => m.fluidExport);
        } else {
            const scope = `${name.split("/")[0]}:cdn`;
            const config = {};
            config[scope] = cdn ? cdn : this.defaultRegistry;

            const codeDetails = {
                package: name,
                config,
            };
            return this.context.codeLoader.load<IComponentFactory>(codeDetails);
        }
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
    }

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
            new MyRegistry(context, this, "https://pragueauspkn-3873244262.azureedge.net"),
            [SharedTextFactoryComponent.containerRequestHandler],
            { generateSummaries });

        // Registering for tasks to run in headless runner.
        if (!generateSummaries) {
            runtime.registerTasks(["snapshot", "spell", "translation", "cache"], "1.0");
            waitForFullConnection(runtime).then(() => {
                // Call snapshot directly from runtime.
                if (runtime.clientType === "snapshot") {
                    console.log(`@fluid-example/shared-text running ${runtime.clientType}`);
                    Snapshotter.run(runtime);
                }
            });
        }

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
