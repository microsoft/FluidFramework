/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { compareFieldUpPaths, compareUpPaths, FieldUpPath, UpPath } from "../../core";
// Allow importing from this specific file which is being tested:
// eslint-disable-next-line import/no-internal-modules
import { PrefixedPath, prefixFieldPath, prefixPath } from "../../feature-libraries/treeCursorUtils";
import { brand } from "../../util";

describe("treeCursorUtils", () => {
    const root: UpPath = {
        parent: undefined,
        parentField: brand("x"),
        parentIndex: 5,
    };
    const child: UpPath = {
        parent: root,
        parentField: brand("z"),
        parentIndex: 10,
    };
    describe("prefixPath", () => {
        it("not wrapped cases", () => {
            assert.equal(prefixPath(undefined, undefined), undefined);
            assert.equal(prefixPath({}, undefined), undefined);
            assert.equal(prefixPath(undefined, root), root);
            assert.equal(prefixPath({}, root), root);
            assert.equal(
                prefixPath({ indexOffset: 1, rootFieldOverride: brand("y") }, undefined),
                undefined,
            );
        });

        it("wrapped root", () => {
            assert(
                compareUpPaths(prefixPath({ indexOffset: 1 }, root), {
                    parent: undefined,
                    parentField: brand("x"),
                    parentIndex: 6,
                }),
            );
            assert(
                compareUpPaths(prefixPath({ rootFieldOverride: brand("y") }, root), {
                    parent: undefined,
                    parentField: brand("y"),
                    parentIndex: 5,
                }),
            );
            assert(
                compareUpPaths(prefixPath({ parent: root }, root), {
                    parent: root,
                    parentField: brand("x"),
                    parentIndex: 5,
                }),
            );
            assert(
                compareUpPaths(
                    prefixPath(
                        { indexOffset: 2, rootFieldOverride: brand("y"), parent: child },
                        root,
                    ),
                    {
                        parent: child,
                        parentField: brand("y"),
                        parentIndex: 7,
                    },
                ),
            );
        });

        it("wrapped child", () => {
            assert(
                compareUpPaths(prefixPath({ indexOffset: 1 }, child), {
                    parent: {
                        parent: undefined,
                        parentField: brand("x"),
                        parentIndex: 6,
                    },
                    parentField: brand("z"),
                    parentIndex: 10,
                }),
            );
            assert(
                compareUpPaths(prefixPath({ rootFieldOverride: brand("y") }, child), {
                    parent: {
                        parent: undefined,
                        parentField: brand("y"),
                        parentIndex: 5,
                    },
                    parentField: brand("z"),
                    parentIndex: 10,
                }),
            );
            assert(
                compareUpPaths(prefixPath({ parent: root }, child), {
                    parent: {
                        parent: root,
                        parentField: brand("x"),
                        parentIndex: 5,
                    },
                    parentField: brand("z"),
                    parentIndex: 10,
                }),
            );
            assert(
                compareUpPaths(
                    prefixPath(
                        { indexOffset: 2, rootFieldOverride: brand("y"), parent: child },
                        child,
                    ),
                    {
                        parent: {
                            parent: child,
                            parentField: brand("y"),
                            parentIndex: 7,
                        },
                        parentField: brand("z"),
                        parentIndex: 10,
                    },
                ),
            );
        });

        it("double wrapped root", () => {
            const prefixed = prefixPath({ indexOffset: 1 }, root);
            const prefixedAgain = prefixPath({ indexOffset: 2 }, prefixed);

            // Check result is correct
            assert(
                compareUpPaths(prefixed, {
                    parent: undefined,
                    parentField: brand("x"),
                    parentIndex: 6,
                }),
            );
            assert(
                compareUpPaths(prefixedAgain, {
                    parent: undefined,
                    parentField: brand("x"),
                    parentIndex: 8,
                }),
            );

            assert(prefixed instanceof PrefixedPath);
            assert(prefixedAgain instanceof PrefixedPath);
            // Check optimization to avoid double wrapping worked
            assert(!(prefixedAgain.path instanceof PrefixedPath));
        });

        it("double wrapped child", () => {
            const prefixed = prefixPath({ indexOffset: 1, rootFieldOverride: brand("c") }, child);
            const prefixedAgain = prefixPath({ indexOffset: 2 }, prefixed);

            // Check result is correct
            assert(
                compareUpPaths(prefixed, {
                    parent: {
                        parent: undefined,
                        parentField: brand("c"),
                        parentIndex: 6,
                    },
                    parentField: brand("z"),
                    parentIndex: 10,
                }),
            );
            assert(
                compareUpPaths(prefixedAgain, {
                    parent: {
                        parent: undefined,
                        parentField: brand("c"),
                        parentIndex: 8,
                    },
                    parentField: brand("z"),
                    parentIndex: 10,
                }),
            );

            assert(prefixed instanceof PrefixedPath);
            assert(prefixedAgain instanceof PrefixedPath);
            // Check optimization to avoid double wrapping worked
            assert(!(prefixedAgain.path instanceof PrefixedPath));
        });

        it("double prefixed", () => {
            const prefixed = prefixPath(
                { indexOffset: 1, rootFieldOverride: brand("b"), parent: root },
                root,
            );
            const prefixedAgain = prefixPath(
                { indexOffset: 2, rootFieldOverride: brand("a"), parent: root },
                prefixed,
            );

            // Check result is correct
            assert(
                compareUpPaths(prefixed, {
                    parent: root,
                    parentField: brand("b"),
                    parentIndex: 6,
                }),
            );
            assert(
                compareUpPaths(prefixedAgain, {
                    parent: {
                        parent: root,
                        parentField: brand("a"),
                        parentIndex: 7,
                    },
                    parentField: brand("b"),
                    parentIndex: 6,
                }),
            );

            assert(prefixed instanceof PrefixedPath);
            assert(prefixedAgain instanceof PrefixedPath);
            // Check optimization to avoid double wrapping worked
            assert(!(prefixedAgain.path instanceof PrefixedPath));
        });
    });

    it("prefixFieldPath", () => {
        const rootFieldPath: FieldUpPath = {
            parent: undefined,
            field: brand("a"),
        };
        assert.equal(prefixFieldPath(undefined, rootFieldPath), rootFieldPath);
        assert.equal(prefixFieldPath({}, rootFieldPath), rootFieldPath);
        assert.equal(prefixFieldPath(undefined, rootFieldPath), rootFieldPath);
        assert.equal(prefixFieldPath({ indexOffset: 0 }, rootFieldPath), rootFieldPath);
        assert(
            compareFieldUpPaths(
                prefixFieldPath(
                    { indexOffset: 1, rootFieldOverride: brand("b"), parent: root },
                    rootFieldPath,
                ),
                {
                    parent: root,
                    field: brand("b"),
                },
            ),
        );

        const childFieldPath: FieldUpPath = {
            parent: root,
            field: brand("a"),
        };

        assert(
            compareFieldUpPaths(
                prefixFieldPath({ indexOffset: 1, rootFieldOverride: brand("b") }, childFieldPath),
                {
                    parent: {
                        parent: undefined,
                        parentField: brand("b"),
                        parentIndex: 6,
                    },
                    field: brand("a"),
                },
            ),
        );
    });
});
