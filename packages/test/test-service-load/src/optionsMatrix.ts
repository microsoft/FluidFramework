/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { ILoaderOptions  } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions, IGCRuntimeOptions, ISummaryRuntimeOptions } from "@fluidframework/container-runtime";
import { assert } from "@fluidframework/common-utils";

// converts all properties of an object to arrays of the
// properties potential values. This will be used by buildPairwiseOptions
// to compute original objects that contain pairwise combinations
// of all property values
export type OptionsMatrix<T extends Record<string, any>> =
    Required<{
        [K in keyof T]: Exclude<T[K], undefined | boolean | number | string> extends  never
            ? readonly (T[K])[]
            : readonly (OptionsMatrix<T[K]>)[]
    }>;

export const booleanCases: readonly (boolean | undefined)[] = [true, false];
export const undefinedCases: readonly (undefined)[] = [undefined];

export const loaderOptionsMatrix: OptionsMatrix<ILoaderOptions> = {
    cache: booleanCases,
    hotSwapContext: booleanCases,
    provideScopeLoader: booleanCases,
    maxClientLeaveWaitTime: undefinedCases,
    noopCountFrequency: undefinedCases,
    noopTimeFrequency: undefinedCases,
};

export const gcOptionsMatrix: OptionsMatrix<IGCRuntimeOptions> = {
    disableGC: booleanCases,
    gcAllowed: booleanCases,
    runFullGC: booleanCases,
};

export const summaryConfigurationMatrix: OptionsMatrix<Partial<ISummaryConfiguration>> = {
    idleTime: undefinedCases,
    maxAckWaitTime: undefinedCases,
    maxOps: undefinedCases,
    maxTime: undefinedCases,
};

export const summaryOptionsMatrix: OptionsMatrix<ISummaryRuntimeOptions> = {
    disableIsolatedChannels: booleanCases,
    generateSummaries: booleanCases,
    initialSummarizerDelayMs: undefinedCases,
    summaryConfigOverrides:[undefined, summaryConfigurationMatrix],
};

export const runtimeOptionsMatrix: OptionsMatrix<IContainerRuntimeOptions> = {
    gcOptions: [undefined, gcOptionsMatrix],
    summaryOptions: [undefined, summaryOptionsMatrix],
};

function applyPair<T>(potentials: T[], pair: {iKey: string, jKey: string, iVal: any, jVal: any}) {
    let potential: T | undefined;
    let found: boolean = false;
    for(const output of potentials) {
        // the pair exists, so nothing to do
        if(output[pair.iKey] === pair.iVal && output[pair.jKey] === pair.jVal) {
            found = true;
            break;
        }
        // half the pair exists, and the other half is empty, so cache this as a potential for to satisfy the pair
        // we can't give up, as the pair may exist in which case we'll not need to apply
        if(potential === undefined) {
            if(pair.iKey in output && output[pair.iKey] === pair.iVal && !(pair.jKey in output)
                || pair.jKey in output && output[pair.jKey] === pair.jVal && !(pair.iKey in output)) {
                potential = output;
            }
        }
    }
    if(!found) {
        if(potential === undefined) {
            potentials.push({
                [pair.iKey]: pair.iVal,
                [pair.jKey]: pair.jVal,
            } as any);
        }else{
            if(pair.iKey in potential) {
                potential[pair.jKey] = pair.jVal;
            }else{
                potential[pair.iKey] = pair.iVal;
            }
        }
    }
}

export function buildPairwiseOptions<T>(optionsMatrix: OptionsMatrix<T>): T[] {
    const valuesMap = new Map<string, any[]>();
    for(const key of Object.keys(optionsMatrix)) {
        const matrixProp = optionsMatrix[key];
        const values: any[] = [];
        assert(Array.isArray(matrixProp), "matrix prop must be an array");
        // if the only value is undefined, we can skip this property
        if(matrixProp.length > 1 || matrixProp[0] !== undefined) {
            for(const val of matrixProp) {
                if(typeof val === "object") {
                    const subOptions = buildPairwiseOptions<any>(val);
                    if(subOptions.length > 1 || subOptions[0] !== undefined) {
                        values.push(...subOptions);
                    }
                }else{
                    values.push(val);
                }
            }
            if(values.length > 1 || values[0] !== undefined) {
                valuesMap.set(key, values);
            }
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const matrixKeys = [...valuesMap.keys()].sort((a,b)=>valuesMap.get(b)!.length  - valuesMap.get(a)!.length);
    const matrixKeysMidPoint = Math.ceil(matrixKeys.length / 2);
    // compute all the pairs of property values, and apply them
    const outputs: T[] = [];
    for(const iKey of matrixKeys.slice(0, matrixKeysMidPoint)) {
        for(const jKey of matrixKeys.slice(matrixKeysMidPoint)) {
            for(const iVal of valuesMap.get(iKey) ?? []) {
                for(const jVal of valuesMap.get(jKey) ?? []) {
                    applyPair(outputs,{iKey,iVal,jKey,jVal});
                }
            }
        }
    }

    // fix up any incomplete outputs
    for(const output of outputs) {
        for(const key of matrixKeys) {
            if(!(key in output)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const values = valuesMap.get(key)!;
                output[key] = values[Math.floor(Math.random() * values.length)];
            }
        }
    }
    return outputs;
}
