/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChaincodeFactory, ICodeLoader } from "@prague/container-definitions";

async function loadScript(scriptUrl: string): Promise<{}> {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptUrl;

      // Dynamically added scripts are async by default. By setting async to false, we are enabling the scripts
      // to be downloaded in parallel, but executed in order. This ensures that a script is executed after all of
      // its dependencies have been loaded and executed.
      script.async = false;

      script.onload = resolve;
      script.onerror = () =>
        reject(new Error(`Failed to download the script at url: ${scriptUrl}`));

      document.head.appendChild(script);
    });
}

export class LocalLoader implements ICodeLoader {
    constructor(baseUrl: string) {
      console.log(baseUrl)
    }

    public async load(source: string): Promise<IChaincodeFactory> {
        const components = source.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }

        // This is a skeleton app bundle that exports the Document and Component classes from the base application.
        // This document is loaded at window.skeleton instead of the standard window.main this allows you to attach your local file
        // to window.main
        await loadScript('https://pragueauspkn-3873244262.azureedge.net/@chaincode/fiddleskeleton@0.0.6/dist/skeleton.bundle.js')
        
        // the local code needs to be wrapped in a function that is stored on the window. 
        // the window.loadLocalCode function needs to set the local code to main
        window['loadLocalCode']();
        return window["main"];
    }
}
  