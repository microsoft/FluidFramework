/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function loadScript(identifier: string, scriptUrl: string, crossOriginAttributeValue?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      // Dynamically added scripts are async by default. By setting async to false, we are enabling the scripts
      // to be downloaded in parallel, but executed in order. This ensures that a script is executed after all of
      // its dependencies have been loaded and executed.
      script.async = false;

      script.src = scriptUrl;

      if (crossOriginAttributeValue !== undefined) {
        script.crossOrigin = crossOriginAttributeValue;
      }

      script.onload = () => resolve(identifier);
      script.onerror = () =>
        reject(new Error(`Failed to download the script with identifier: ${identifier} at url: ${scriptUrl}`));

      document.head.appendChild(script);
    });
}
