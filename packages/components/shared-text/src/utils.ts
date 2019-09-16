/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@microsoft/fluid-map";
import { IComponentHandle } from "@prague/component-core-interfaces";
import { default as axios } from "axios";

export async function downloadRawText(textUrl: string): Promise<string> {
    const data = await axios.get(textUrl);
    return data.data;
}

// Wait for the runtime to get fully connected.
export async function waitForFullConnection(runtime: any): Promise<void> {
    if (runtime.connected) {
        return;
    } else {
        return new Promise<void>((resolve, reject) => {
            runtime.once("connected", () => {
                resolve();
            });
        });
    }
}

export async function getInsights(map: ISharedMap, id: string): Promise<ISharedMap> {
    const insightsHandle = await map.wait<IComponentHandle>("insights");
    const insights = await insightsHandle.get<ISharedMap>();

    const handle = await insights.wait<IComponentHandle>(id);
    return handle.get<ISharedMap>();
}

export async function setTranslation(
    document: { existing: boolean, getRoot: () => ISharedMap },
    id: string,
    fromLanguage: string,
    toLanguage: string,
): Promise<void> {
    // Create the translations map
    const handle = await document.getRoot().wait<IComponentHandle>("insights");
    const insights = await handle.get<ISharedMap>();

    const idMapHandle = await insights.wait<IComponentHandle>(id);
    const idMap = await idMapHandle.get<ISharedMap>();

    if (!document.existing) {
        idMap.set("translationFrom", fromLanguage);
        idMap.set("translationTo", toLanguage);
    }
}
