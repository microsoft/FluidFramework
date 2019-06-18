/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LoadPragueComponent } from '@prague/vanilla-loader';

export default async function loadPrague(url: string, token: string, div: HTMLDivElement) {
    LoadPragueComponent(url, () => Promise.resolve(token), div, "simple-prague-loader"); 
}