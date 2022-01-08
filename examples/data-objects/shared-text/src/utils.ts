/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISharedMap, IValueChanged } from "@fluidframework/map";
import { default as axios } from "axios";

export const mapWait = async <T = any>(map: ISharedMap, key: string): Promise<T> => {
    const maybeValue = map.get<T>(key);
    if (maybeValue !== undefined) {
        return maybeValue;
    }

    return new Promise((resolve) => {
        const handler = (changed: IValueChanged) => {
            if (changed.key === key) {
                map.off("valueChanged", handler);
                const value = map.get<T>(changed.key);
                if (value === undefined) {
                    throw new Error("Unexpected valueChanged result");
                }
                resolve(value);
            }
        };
        map.on("valueChanged", handler);
    });
};

export async function downloadRawText(textUrl: string): Promise<string> {
    const data = await axios.get(textUrl);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    const insightsHandle = await mapWait<IFluidHandle<ISharedMap>>(map, "insights");
    const insights = await insightsHandle.get();

    const handle = await mapWait<IFluidHandle<ISharedMap>>(insights, id);
    return handle.get();
}

export async function setTranslation(
    rootMap: ISharedMap,
    id: string,
    fromLanguage: string,
    toLanguage: string,
    existing: boolean,
): Promise<void> {
    // Create the translations map
    const handle = await mapWait<IFluidHandle<ISharedMap>>(rootMap, "insights");
    const insights = await handle.get();

    const idMapHandle = await mapWait<IFluidHandle<ISharedMap>>(insights, id);
    const idMap = await idMapHandle.get();

    if (!existing) {
        idMap.set("translationFrom", fromLanguage);
        idMap.set("translationTo", toLanguage);
    }
}
