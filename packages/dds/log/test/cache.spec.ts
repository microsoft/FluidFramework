// /*!
//  * Copyright (c) Microsoft Corporation. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import "mocha";
// import { strict as assert } from "assert";
// import { LogIndex } from "../src/cache";

// describe("LogIndex", () => {
//     let index: LogIndex<any>;

//     beforeEach(async () => {
//         index = new LogIndex();
//         assert.equal(index.length, 0);
//     });

//     it("works", () => {
//         for (let i = 0; i < (256 * 256 * 256); i++) {
//             index.append(i);
//             assert.equal(index.length, i + 1);
//         }
//     });
// });
