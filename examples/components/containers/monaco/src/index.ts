/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// eslint-disable-next-line import/no-unassigned-import
import "./publicpath";

import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IContainerContext, IRuntime } from "@microsoft/fluid-container-definitions";
import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";

/* eslint-disable @typescript-eslint/no-require-imports, max-len */
(self as any).MonacoEnvironment = {
    getWorkerUrl(moduleId, label) {
        switch (label) {
            case "json":
                return require("blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/json/json.worker");
            case "css":
                return require("blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/css/css.worker");
            case "html":
                return require("blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/html/html.worker");
            case "typescript":
            case "javascript":
                return require("blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/typescript/ts.worker");
            default:
                return require("blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/editor/editor.worker");
        }
    },
};
/* eslint-enable @typescript-eslint/no-require-imports, max-len */

async function getMonacoFluidExport() {
    const monaco = await import("@fluid-example/monaco");
    return monaco.fluidExport.IComponentFactory;
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const registry = new Map<string, Promise<IComponentFactory>>([["@fluid-example/monaco", getMonacoFluidExport()]]);

    const runtime = await ContainerRuntime.load(context, registry,
        [
            // Register path handler for inbound messages
            async (request: IRequest, containerRuntime) => {
                console.log(request.url);
                const requestUrl = request.url.length > 0 && request.url.startsWith("/")
                    ? request.url.substr(1)
                    : request.url;
                const trailingSlash = requestUrl.indexOf("/");

                const componentId = requestUrl
                    ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
                    : "code";
                const component = await containerRuntime.getComponentRuntime(componentId, true);

                const pathForComponent = trailingSlash !== -1 ? requestUrl.substr(trailingSlash) : requestUrl;
                return component.request({ url: pathForComponent });
            },
        ],
    );

    // On first boot create the base component
    if (!runtime.existing) {
        const componentRuntime = await runtime.createComponent_UNSAFE("code", "@fluid-example/monaco");
        componentRuntime.attach();
    }

    return runtime;
}
