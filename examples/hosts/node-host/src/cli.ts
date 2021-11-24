/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as readline from "readline";
import { IKeyValue } from "@fluid-example/key-value-cache";
import { FluidObject } from "@fluidframework/core-interfaces";

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
async function readlineAsync(input: readline.ReadLine, prompt: string): Promise<string> {
    return new Promise<string>((resolve) => {
        input.question(prompt, (answer) => resolve(answer));
    });
}

/**
 * A simple command line utility to interact with the key-value-cache fluidObject.
 */
export async function launchCLI(fluidObject: FluidObject<IKeyValue>) {
    const keyValue: IKeyValue | undefined = fluidObject.IKeyValue;
    if (keyValue === undefined) {
        return;
    }
    console.log("");
    console.log("Begin entering options (ctrl+c to quit)");
    console.log("Type '1' to insert a key and value");
    console.log("Type '2' to get a value for a key");
    console.log("Type '3' to display all key value pairs");
    console.log("");

    const input = readline.createInterface(process.stdin, process.stdout);

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const option = await readlineAsync(input, "Option: ");
        if (option === "1") {
            console.log("");
            const inputKey = await readlineAsync(input, "Enter Key: ");
            const inputVal = await readlineAsync(input, "Enter Value: ");
            keyValue.set(inputKey, inputVal);
            console.log("");
        } else if (option === "2") {
            console.log("");
            const inputKey = await readlineAsync(input, "Enter Key: ");
            console.log(`${inputKey}: ${keyValue.get(inputKey)}`);
            console.log("");
        } else if (option === "3") {
            console.log("");
            const entries = [...keyValue.entries()];
            if (entries.length === 0) {
                console.log("Cache is empty");
            } else {
                for (const item of entries) {
                    console.log(`${item[0]}: ${item[1]}`);
                }
            }
            console.log("");
        } else {
            console.log("Invalid option");
        }
    }
}
