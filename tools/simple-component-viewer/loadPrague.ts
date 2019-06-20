/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LoadPragueComponent, loadIFramedPragueComponent } from '@prague/r11s-vanilla-loader';

export default async function loadPrague(url: string, token: string, div: HTMLDivElement, useIframe: boolean) {
    if (useIframe) {
        loadIFramedPragueComponent(url, () => Promise.resolve(token), div, "simple-prague-loader"); 
    }
    else {
        LoadPragueComponent(url, () => Promise.resolve(token), div, "simple-prague-loader"); 
    }
}