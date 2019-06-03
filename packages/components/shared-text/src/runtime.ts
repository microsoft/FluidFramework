import {
    IContainerContext,
    IRequest,
    IRuntime,
} from "@prague/container-definitions";
import { ContainerRuntime, IComponentRegistry } from "@prague/container-runtime";
import { IComponentFactory } from "@prague/runtime-definitions";
import * as Snapshotter from "@prague/snapshotter";
import { instantiateComponent, SharedTextRunner } from "./component";
import { GraphIQLView } from "./graphql";
import { waitForFullConnection } from "./utils";

const charts = import(/* webpackChunkName: "charts", webpackPrefetch: true */ "@chaincode/charts");
const monaco = import(/* webpackChunkName: "monaco", webpackPrefetch: true */ "@chaincode/monaco");
const pinpoint = import(/* webpackChunkName: "pinpoint", webpackPrefetch: true */ "@chaincode/pinpoint-editor");
const collections = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */"@component/collection-components");

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
        if (name === "@chaincode/charts") {
            return charts;
        } else if (name === "@component/collection-components") {
            return collections;
        } else if (name === "@component/collection-components/lib/progress") {
            const collectionsResolved = await collections;
            return collectionsResolved.progressBars;
        // Uncomment the below once adding in math.
        // For multiple comonents within a package we might want to formalize the module lookup
        // } else if (name === "@component/collection-components/lib/math") {
        //     const collectionsResolved = await collections;
        //     return collectionsResolved.math;
        } else if (name === "@chaincode/monaco") {
            return monaco;
        } else if (name === "@chaincode/pinpoint-editor") {
            return pinpoint;
        } else if (name === "@chaincode/shared-text") {
            return { instantiateComponent };
        } else {
            return this.context.codeLoader.load<IComponentFactory>(name);
        }
    }
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const runtime = await ContainerRuntime.Load(context, new MyRegistry(context));

    // Register path handler for inbound messages
    runtime.registerRequestHandler(async (request: IRequest) => {
        console.log(request.url);

        if (request.url === "/graphiql") {
            const sharedText = (await runtime.request({ url: "/" })).value as SharedTextRunner;
            return { status: 200, mimeType: "prague/component", value: new GraphIQLView(sharedText) };
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
            runtime.createAndAttachComponent("collections", "@component/collection-components"),
            runtime.createAndAttachComponent("text", "@chaincode/shared-text"),
        ])
        .catch((error) => {
            context.error(error);
        });
    }

    return runtime;
}
