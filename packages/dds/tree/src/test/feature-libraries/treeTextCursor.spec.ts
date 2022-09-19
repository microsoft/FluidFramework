// /*!
//  * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import { strict as assert } from "assert";
// import { Jsonable } from "@fluidframework/datastore-definitions";
// import { JsonCursor } from "../../domains";
// import { jsonableTreeFromCursorNew, singleMapTreeCursor } from "../../feature-libraries";

// // Allow importing from this specific file which is being tested:
// /* eslint-disable-next-line import/no-internal-modules */
// import { jsonableTreeFromCursor, singleTextCursor } from "../../feature-libraries/treeTextCursor";
// import { ITreeCursorNew as ITreeCursor } from "../../forest";
// import { StoredSchemaRepository } from "../../schema-stored";

// import { JsonableTree } from "../../tree";
// import { brand } from "../../util";
// import { testCursors, testJsonCompatibleCursor } from "../cursor.spec";

// const testCases: [string, JsonableTree][] = [
//     ["minimal", { type: brand("Foo") }],
//     ["value", { type: brand("Foo"), value: "test" }],
//     ["nested", { type: brand("Foo"), fields: { x: [{ type: brand("Bar") }, { type: brand("Foo"), value: 6 }] } }],
//     ["multiple fields", {
//         type: brand("Foo"),
//         fields: {
//             a: [{ type: brand("Bar") }],
//             b: [{ type: brand("Baz") }],
//         },
//     }],
//     ["double nested", {
//         type: brand("Foo"),
//         fields: {
//             b: [{
//                 type: brand("Bar"),
//                 fields: { c: [{ type: brand("Baz") }] },
//             }],
//         },
//     }],
//     ["complex", {
//         type: brand("Foo"),
//         fields: {
//             a: [{ type: brand("Bar") }],
//             b: [{
//                 type: brand("Bar"),
//                 fields: {
//                     c: [{ type: brand("Bar"), value: 6 }],
//                 },
//             }],
//         },
//     }],
//     ["siblings restored on up", {
//         type: brand("Foo"),
//         fields: {
//             X: [
//                 {
//                     type: brand("a"),
//                     // Inner node so that when navigating up from it,
//                     // The cursor's siblings value needs to be restored.
//                     fields: { q: [{ type: brand("b") }] },
//                 },
//                 { type: brand("c") },
//             ],
//         },
//     }],
// ];

// function checkTextCursorRequirements(clone: Jsonable, expected: Jsonable) {
//     // Check objects are actually json compatible
//     if (typeof clone === "object") {
//         const text = JSON.stringify(clone);
//         const parsed = JSON.parse(text);
//         assert.deepEqual(parsed, expected);
//     }
// }

// // Tests for TextCursor and jsonableTreeFromCursor.
// testJsonCompatibleCursor(
//     "textTreeFormat",
//     (data?: Jsonable) => singleTextCursor(jsonableTreeFromCursorNew(new JsonCursor(data))),
//     checkTextCursorRequirements,
// );

// // TODO: put these in a better place / unify with object forest tests.
// // testJsonCompatibleCursor(
// //     "object-forest cursor",
// //     (data?: Jsonable): ITreeCursor => {
// //         const schema = new StoredSchemaRepository(defaultSchemaPolicy);
// //         const forest = new ObjectForest(schema);
// //         const normalized = jsonableTreeFromCursor(new JsonCursor(data));
// //         // console.log(normalized);
// //         initializeForest(forest, [normalized]);
// //         const cursor = forest.allocateCursor();
// //         assert.equal(forest.tryMoveCursorTo(forest.root(forest.rootField), cursor), TreeNavigationResult.Ok);
// //         return cursor;
// //     },
// //     checkTextCursorRequirements,
// // );

// // Checks to make sure singleTextCursor and test datasets are working properly,
// // since its used in the below test suite to test other formats.
// describe("JsonableTree extra tests", () => {
//     describe("round trip", () => {
//         for (const [name, data] of testCases) {
//             it(name, () => {
//                 const cursor = singleTextCursor(data);
//                 const clone = jsonableTreeFromCursor(cursor);
//                 assert.deepEqual(clone, data);
//                 // Check objects are actually json compatible
//                 const text = JSON.stringify(clone);
//                 const parsed = JSON.parse(text);
//                 assert.deepEqual(parsed, data);
//             });
//         }
//     });
// });

// testCursors(
//     "textTreeFormat",
//     testCases.map(([name, data]) => ({
//         cursorName: name,
//         cursor: singleTextCursor(jsonableTreeFromCursorNew(new JsonCursor(data))),
//     })),
// );

// // TODO: this test suite should be refactored to move this into its own file and share the suite implementation.
// testCursors(
//     "mapTreeFormat",
//     testCases.map(([name, data]) => ({
//         cursorName: name,
//         cursor: singleMapTreeCursor(jsonableTreeFromCursorNew(new JsonCursor(data))),
//     })),
// );
