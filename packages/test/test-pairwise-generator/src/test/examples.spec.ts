/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { generatePairwiseOptions, OptionsMatrix } from "../index";

describe("generatePairwiseOptions.examples",()=>{
    it("Testing a function",()=>{
        const myFunction =
            (param1: boolean, param2: "string1" | "string2", param3?: number)=>{};

        const options = generatePairwiseOptions<{p1: boolean, p2: "string1" | "string2", p3?: number}>({
            p1: [true, false],
            p2: ["string1", "string2"],
            p3: [undefined, 0, 10, 100],
        });

        for(const option  of options) {
            myFunction(option.p1, option.p2, option.p3);
        }
    });

    it("Testing an object",()=>{
        interface MyObject{
            prop1: boolean,
            prop2?: number,
            prop3?: string,
        }

        const myObjectMatrix: OptionsMatrix<MyObject> = {
            prop1: [true, false],
            prop2: [undefined, 37, 242],
            prop3: [undefined],
        };

        const myObjects = generatePairwiseOptions<MyObject>(myObjectMatrix);

        // use the options to drive a scenario
        const runScenario = (instance: MyObject)=>{};
        for(const instance of myObjects) {
            runScenario(instance);
        }
    });
});
