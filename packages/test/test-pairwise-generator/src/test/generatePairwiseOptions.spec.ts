/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { generatePairwiseOptions, OptionsMatrix } from "../index";

interface SimpleOptions{
    oBoolean?: boolean,
    rBoolean: boolean,
    number?: number,
    string?: string,
    array?: number[];

}
const optionsToString = <T>(... options: T[]) =>
    options.map((o) => JSON.stringify(o))
    .join("\n");

const simpleOptionsMatrix: OptionsMatrix<SimpleOptions> = {
    number: [undefined, 7],
    oBoolean: [undefined, true, false],
    rBoolean: [true, false],
    string: [undefined],
    array: [undefined, [0]],
};

function validateSimpleOption(option: SimpleOptions) {
    assert("number" in option, `number not defined:${optionsToString(option)}`);
    assert(option.number === undefined || option.number === 7,
         `number not expected value:${optionsToString(option)}`);

    assert("oBoolean" in option, `oBoolean not defined:${option}`);
    assert(option.oBoolean === undefined || option.oBoolean === true || option.oBoolean === false,
         `oBoolean not expected value:${optionsToString(option)}`);

    assert("rBoolean" in option, `rBoolean not defined:${option}`);
    assert(option.rBoolean === true || option.rBoolean === false,
         `rBoolean not expected value:${optionsToString(option)}`);

    // string only has undefined as a value, so should be pruned from exploration
    assert(!("string" in option), `string is defined:${option}`);

    assert("array" in option, `array not defined:${option}`);
    assert(option.array === undefined || option.array[0] === 0,
         `array not expected value:${optionsToString(option)}`);
}

const simpleValues = generatePairwiseOptions<SimpleOptions>(simpleOptionsMatrix);

interface ComplexOptions {
    oSimple?: SimpleOptions;
    rSimple: SimpleOptions;
    boolean?: boolean
}

const complexOptionsMatrix: OptionsMatrix<ComplexOptions> = {
    boolean: [undefined, true, false],
    oSimple: [undefined],
    rSimple: simpleValues,
};

const complexValues = generatePairwiseOptions<ComplexOptions>(complexOptionsMatrix);

function validateComplexOption(option: ComplexOptions) {
    assert("boolean" in option, `boolean not defined:${option}`);
    assert(
        option.boolean === undefined || option.boolean === true || option.boolean === false,
        `boolean not expected value:${option}`);

    assert("rSimple" in option, `rSimple not defined:${option}`);
    validateSimpleOption(option.rSimple);

    // oSimple only has undefined as a value, so should be pruned from exploration
    assert(!("oSimple" in option), `oSimple is defined:${option}`);
}

/**
 * No pruning or optimizations, just calculate and validate all pairs
 */
function validatePairsExhaustively<T>(
    matrix: OptionsMatrix<T>, values: T[]) {
    const keys = Object.keys(matrix);
    for (const i of keys) {
        for (const j of keys) {
            if (i === j) {
                continue;
            }
            for (const iv of matrix[i]) {
                for (const jv of matrix[j]) {
                    let found = false;
                    for (const val of values) {
                        if (val[i] === iv && val[j] === jv) {
                            found = true;
                            break;
                        }
                    }
                    assert(
                        found,
                        // eslint-disable-next-line max-len
                        `failed to find pair: ${i} === ${optionsToString(iv)} && ${j} === ${optionsToString(jv)}\n${optionsToString(...values)}`);
                }
            }
        }
    }
}

describe("generatePairwiseOptions", () => {
    it("SimpleOptions", () => {
        assert.strictEqual(simpleValues.length, 8, optionsToString(...simpleValues));
        for (const option of simpleValues) {
            validateSimpleOption(option);
        }
        validatePairsExhaustively(simpleOptionsMatrix, simpleValues);
    });

    it("ComplexOptions", () => {
        assert.strictEqual(complexValues.length, 24, optionsToString(...complexValues));

        for (const option of complexValues) {
            validateComplexOption(option);
        }

        validatePairsExhaustively<ComplexOptions>(
            complexOptionsMatrix,
            complexValues);
    });

    it("Generate single option matrix", () => {
        const optionsMatrix = { prop: ["a", "b", "c"] };
        const values = generatePairwiseOptions(optionsMatrix);
        validatePairsExhaustively(optionsMatrix, values);
    });
    it("Generate empty option matrix", () => {
        const optionsMatrix = { prop: [undefined] };
        const values = generatePairwiseOptions(optionsMatrix);
        validatePairsExhaustively(optionsMatrix, values);
    });
});
