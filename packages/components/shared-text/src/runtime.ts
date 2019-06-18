/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContainerContext,
    IRequest,
    IRuntime,
} from "@prague/container-definitions";
import { ContainerRuntime, IComponentRegistry } from "@prague/container-runtime";
import { TextAnalyzer } from "@prague/intelligence-runner";
import { IComponentFactory } from "@prague/runtime-definitions";
import * as Snapshotter from "@prague/snapshotter";
import { instantiateComponent, SharedTextRunner } from "./component";
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
    constructor(private context: IContainerContext) {
    }

    public async get(name: string): Promise<IComponentFactory> {
        if (name === "@chaincode/shared-text") {
            return { instantiateComponent };
        } else if (name === "@chaincode/math") {
            return math;
        } else if (name === "@chaincode/charts") {
            return charts;
        } else if (name === "@chaincode/progress-bars") {
            return progressBars;
        } else if (name === "@chaincode/video-players") {
            return videoPlayers;
        } else if (name === "@chaincode/monaco") {
            return monaco;
        } else if (name === "@chaincode/pinpoint-editor") {
            return pinpoint;
        } else {
            return this.context.codeLoader.load<IComponentFactory>(name);
        }
    }
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const runtime = await ContainerRuntime.load(context, new MyRegistry(context));

    // Register path handler for inbound messages
    runtime.registerRequestHandler(async (request: IRequest) => {
        console.log(request.url);

        if (request.url === "/graphiql") {
            const sharedText = (await runtime.request({ url: "/" })).value as SharedTextRunner;
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
    runtime.registerTasks(["snapshot", "spell", "translation", "cache"], "1.0");

    waitForFullConnection(runtime).then(() => {
        // Call snapshot directly from runtime.
        if (runtime.clientType === "snapshot") {
            console.log(`@chaincode/shared-text running ${runtime.clientType}`);
            Snapshotter.run(runtime);
        }
    });

    // On first boot create the base component
    if (!runtime.existing) {
        await Promise.all([
            runtime.createAndAttachComponent("progress-bars", "@chaincode/progress-bars"),
            runtime.createAndAttachComponent("text", "@chaincode/shared-text"),
            runtime.createAndAttachComponent("math", "@chaincode/math"),
            runtime.createAndAttachComponent("video-players", "@chaincode/video-players"),
        ])
        .catch((error) => {
            context.error(error);
        });
    }

    return runtime;
}
