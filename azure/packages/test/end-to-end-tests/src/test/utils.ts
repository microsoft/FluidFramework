/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureMember, IAzureAudience } from "@fluidframework/azure-client";
import { ISharedMap, IValueChanged } from "@fluidframework/map";

export const waitForMyself = async (audience: IAzureAudience): Promise<AzureMember> => {
    return new Promise((resolve) => {
        const handler = (): void => {
            const value = audience.getMyself();
            if (value) {
                resolve(value);
            }
        };
        audience.on("memberAdded", handler);
    });
};

export const mapWait = async <T>(map: ISharedMap, key: string): Promise<T> => {
    const maybeValue = map.get<T>(key);
    if (maybeValue !== undefined) {
        return maybeValue;
    }

    return new Promise((resolve) => {
        const handler = (changed: IValueChanged): void => {
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
