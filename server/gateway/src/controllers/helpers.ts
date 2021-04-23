/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IResolvedFluidCodeDetails,
    IFluidModule,
} from "@fluidframework/container-definitions";

export function seedFromScriptIds(
    pkg: IResolvedFluidCodeDetails | undefined,
    scriptIds: string[]):
    [[IResolvedFluidCodeDetails, Promise<IFluidModule>]] | undefined {
    if (pkg !== undefined) {
        return [
            [
                pkg,
                new Promise<IFluidModule>((resolve, reject) => {
                    scriptIds.forEach((id) => {
                        const script = document.getElementById(id);
                        // eslint-disable-next-line no-null/no-null
                        if (script === null) {
                            reject(new Error(`No script with id: ${id}`));
                            return;
                        }
                        script.onload = () => {
                            const maybeEntrypoint = window[pkg.resolvedPackage.fluid?.browser?.umd?.library as string];
                            if (maybeEntrypoint !== undefined) {
                                resolve(maybeEntrypoint as IFluidModule);
                            }
                        };
                        script.onerror = () => reject(new Error(`Failed to download the script with id: ${id}`));
                    });
                }),
            ],
        ];
    }
}
