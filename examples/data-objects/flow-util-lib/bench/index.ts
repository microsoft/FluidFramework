/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Suite } from "benchmark";
import { bsearch } from "../src/bsearch";
import { lis } from "../src/lis";
import { bsearch2Shim } from "../test/bsearch2Shim";
import { lis as patience } from "../test/patience";

{
    const seq = [ 46, 88, 53, 56, 30, 42, 75, 37, 66, 9, 97, 52, 39, 90, 3, 34, 98, 25, 65, 17 ];

    new Suite("longest increasing subsequence")
        .add(`lis`, () => lis(seq))
        .add(`patience`, () => patience(seq))
        .on("cycle", (event: any) => {
            console.log(String(event.target));
        })
        .on("error", (event: any) => {
            console.error(String(event.target.error));
        })
        .on("complete", (event: any) => {
            console.log(
                `Fastest is ${event.currentTarget.filter("fastest").map("name")}\n`,
            );
        })
      .run();
}

{
    const items = new Array(1000).fill(0).map((value, index) => index);
    let sum = 0;

    new Suite("bsearch")
        .add(`bsearch: 4 items`, () => {
            sum += bsearch(items, 0, 0, 4);
            sum |= 0;
        })
        .add(`bsearch: 1000 items`, () => {
            sum += bsearch(items, 0);
            sum |= 0;
        })
        .add(`bsearch2: 4 items`, () => {
            sum += bsearch2Shim(items, 0, 0, 4);
            sum |= 0;
        })
        .add(`bsearch2: 1000 items`, () => {
            sum += bsearch2Shim(items, 0);
            sum |= 0;
        })
        .on("cycle", (event: any) => {
            console.log(String(event.target));
        })
        .on("error", (event: any) => {
            console.error(String(event.target.error));
        })
        .on("complete", (event: any) => {
            console.log(
                `Fastest is ${event.currentTarget.filter("fastest").map("name")}\n`,
            );
            console.log(sum);
        })
        .run();
}
