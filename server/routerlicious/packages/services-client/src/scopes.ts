/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@microsoft/fluid-protocol-definitions";

interface IScope {
    read: boolean;
    write: boolean;
    summarize: boolean;
}

function calculateScope(scopes: string[]): IScope | undefined {
    if (scopes === undefined || scopes.length === 0) {
        return undefined;
    }
    const read = scopes.includes(ScopeType.DocRead);
    const write = scopes.includes(ScopeType.DocWrite);
    const summarize = scopes.includes(ScopeType.SummaryWrite);
    return {
        read,
        summarize,
        write,
    };
}

// TODO: undefined returns true only for back-compat. return false when everybody upgrades.
export function canRead(scopes: string[]): boolean {
    const clientScope = calculateScope(scopes);
    return clientScope === undefined ? true : clientScope.read;
}

export function canWrite(scopes: string[]): boolean {
    const clientScope = calculateScope(scopes);
    return clientScope === undefined ? true : clientScope.write;
}

export function canSummarize(scopes: string[]): boolean {
    const clientScope = calculateScope(scopes);
    return clientScope === undefined ? true : clientScope.summarize;
}
