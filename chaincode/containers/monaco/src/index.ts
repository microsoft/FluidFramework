// set the base path for all dynamic imports first
import "./publicpath";

import { IContainerContext, IRequest, IRuntime } from "@prague/container-definitions";
import { Runtime } from "@prague/runtime";

const monaco = import("@chaincode/monaco");

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

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const registry = new Map<string, any>([["@chaincode/monaco", monaco]]);

    const runtime = await Runtime.Load(registry, context);

    // Register path handler for inbound messages
    runtime.registerRequestHandler(async (request: IRequest) => {
        console.log(request.url);
        const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
            ? request.url.substr(1)
            : request.url;
        const trailingSlash = requestUrl.indexOf("/");

        const componentId = requestUrl
            ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
            : "code";
        const component = await runtime.getComponent(componentId, true);

        // If there is a trailing slash forward to the component. Otherwise handle directly.
        if (trailingSlash === -1) {
            return { status: 200, mimeType: "prague/component", value: component };
        } else {
            return component.request({ url: requestUrl.substr(trailingSlash) });
        }
    });

    runtime.registerTasks(["snapshot"]);

    // On first boot create the base component
    if (!runtime.existing) {
        runtime.createAndAttachComponent("code", "@chaincode/monaco").catch((error) => {
            context.error(error);
        });
    }

    return runtime;
}
