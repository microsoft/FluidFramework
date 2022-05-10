/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { generatePairwiseOptions, OptionsMatrix } from "../index";

describe("generatePairwiseOptions.examples", () => {
    it("Testing a function", () => {
        const myFunction =
            (param1: boolean, param2: "string1" | "string2", param3?: number) => {};

        const options = generatePairwiseOptions<{ p1: boolean; p2: "string1" | "string2"; p3?: number; }>({
            p1: [true, false],
            p2: ["string1", "string2"],
            p3: [undefined, 0, 10, 100],
        });

        for (const option of options) {
            myFunction(option.p1, option.p2, option.p3);
        }
    });

    it("Testing an object", () => {
        interface MyObject{
            prop1: boolean;
            prop2?: number;
            prop3?: string;
        }

        const myObjectMatrix: OptionsMatrix<MyObject> = {
            prop1: [true, false],
            prop2: [undefined, 37, 242],
            prop3: [undefined],
        };

        const myObjects = generatePairwiseOptions<MyObject>(myObjectMatrix);

        // use the options to drive a scenario
        const runScenario = (instance: MyObject) => {};
        for (const instance of myObjects) {
            runScenario(instance);
        }
    });

    it("Generate a fixed length Array", () => {
        const arrayMatrix: OptionsMatrix<ArrayLike<number>> = {
            0: [3, 6, 9, 12, 15],
            1: [7, 14, 28],
            length: [2],
        };

        const myArrayLikes = generatePairwiseOptions<ArrayLike<number>>(arrayMatrix);

        // use the array to drive a scenario
        const runScenario = (numbers: number[]) => {
            assert.strictEqual(numbers.length, 2);
            assert(numbers[0] % 3 === 0);
            assert(numbers[1] % 7 === 0);
        };
        for (const arrayLike of myArrayLikes) {
            runScenario(Array.from(arrayLike));
        }
    });

    it("Generate an Complex object using nested options matrices", () => {
        const arrayMatrix: OptionsMatrix<ArrayLike<number>> = {
            0: [3, 6, 9, 12, 15],
            1: [7, 14, 28],
            length: [2],
        };

        interface MyComplexObject {
            numbers?: number[];
            subObject: { str: string; };
        }
        // in this example we generate pairwise options for keys on the main object to
        // create the values which will then be pairwise matched with eachother
        const complexObjectMatrix: OptionsMatrix<MyComplexObject> = {
            numbers: [undefined, ... generatePairwiseOptions<ArrayLike<number>>(arrayMatrix).map((a) => Array.from(a))],
            subObject: generatePairwiseOptions<{ str: string; }>({ str: ["a", "b", "c"] }),
        };

        const complexObjects = generatePairwiseOptions<MyComplexObject>(complexObjectMatrix);

        // use the array to drive a scenario
        const runScenario = (complexObject: MyComplexObject) => {
        };
        for (const complexObject of complexObjects) {
            runScenario(complexObject);
        }
    });
});
