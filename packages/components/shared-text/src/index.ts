/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// tslint:disable-next-line:no-import-side-effect
import "./publicpath";

import { IComponent, IContainerContext, IRequest, IRuntime, IRuntimeFactory } from "@prague/container-definitions";
import { ContainerRuntime, IComponentRegistry } from "@prague/container-runtime";
import { TextAnalyzer } from "@prague/intelligence-runner";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { IComponentFactory } from "@prague/runtime-definitions";
import * as Snapshotter from "@prague/snapshotter";
import * as sharedTextComponent from "./component";
import { GraphIQLView } from "./graphql";
import { waitForFullConnection } from "./utils";

const charts = import(/* webpackChunkName: "charts", webpackPrefetch: true */ "@chaincode/charts");
const math = import(/* webpackChunkName: "math", webpackPrefetch: true */ "@chaincode/math");
const monaco = import(/* webpackChunkName: "monaco", webpackPrefetch: true */ "@chaincode/monaco");
const pinpoint = import(/* webpackChunkName: "pinpoint", webpackPrefetch: true */ "@chaincode/pinpoint-editor");
const progressBars = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */ "@chaincode/progress-bars");
const videoPlayers = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */ "@chaincode/video-players");
const images = import(
    /* webpackChunkName: "image-collection", webpackPrefetch: true */ "@chaincode/image-collection");

// tslint:disable
(self as any).MonacoEnvironment = {
	getWorkerUrl: function (moduleId, label) {
		switch (label) {
			case 'json': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/json/json.worker');
			case 'css': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/css/css.worker');
			case 'html': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/html/html.worker');
			case 'typescript':
			case 'javascript': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/typescript/ts.worker');
			default:
				return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/editor/editor.worker');
		}
	}
};
// tslint:enable

class MyRegistry implements IComponentRegistry {
    constructor(private context: IContainerContext, private readonly sharedTextFactory: SharedTextFactoryComponent) {
    }

    public async get(name: string): Promise<IComponentFactory> {
        if (name === "@chaincode/shared-text") {
            return this.sharedTextFactory;
        } else if (name === "@chaincode/math") {
            return math;
        } else if (name === "@chaincode/charts") {
            return charts;
        } else if (name === "@chaincode/progress-bars") {
            return progressBars;
        } else if (name === "@chaincode/video-players") {
            return videoPlayers;
        } else if (name === "@chaincode/image-collection") {
            return images;
        } else if (name === "@chaincode/monaco") {
            return monaco;
        } else if (name === "@chaincode/pinpoint-editor") {
            return pinpoint;
        } else {
            return this.context.codeLoader.load<IComponentFactory>(name);
        }
    }
}

class SharedTextFactoryComponent implements IComponent, IComponentFactory, IRuntimeFactory {
    public static supportedInterfaces = ["IComponentFactory", "IRuntimeFactory"];

    public query(id: string): any {
        return SharedTextFactoryComponent.supportedInterfaces.indexOf(id) !== -1 ? exports : undefined;
    }

    public list(): string[] {
        return SharedTextFactoryComponent.supportedInterfaces;
    }

    public async instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
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
            { generateSummaries });

        // Register path handler for inbound messages
        runtime.registerRequestHandler(async (request: IRequest) => {
            console.log(request.url);

            if (request.url === "/graphiql") {
                const sharedText = (await runtime.request({ url: "/" })).value as sharedTextComponent.SharedTextRunner;
                return { status: 200, mimeType: "prague/component", value: new GraphIQLView(sharedText) };
            } else if (request.url === "/text-analyzer") {
                const textAnalyzer = new TextAnalyzer();
                return textAnalyzer.request(request);
            } else {
                console.log(request.url);
                const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
                    ? request.url.substr(1)
                    : request.url;
                const trailingSlash = requestUrl.indexOf("/");

                const componentId = requestUrl
                    ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                    : "text";
                const component = await runtime.getComponentRuntime(componentId, true);

                return component.request({ url: trailingSlash === -1 ? "" : requestUrl.substr(trailingSlash) });
            }
        });

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
                runtime.createComponent("progress-bars", "@chaincode/progress-bars")
                    .then((componentRuntime) => componentRuntime.attach()),
                runtime.createComponent("text", "@chaincode/shared-text")
                    .then((componentRuntime) => componentRuntime.attach()),
                runtime.createComponent("math", "@chaincode/math")
                    .then((componentRuntime) => componentRuntime.attach()),
                runtime.createComponent("video-players", "@chaincode/video-players")
                    .then((componentRuntime) => componentRuntime.attach()),
                runtime.createComponent("images", "@chaincode/image-collection")
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

// TODO included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return fluidExport.instantiateRuntime(context);
}

// TODO included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
  return fluidExport.instantiateComponent(context);
}
