import { strict as assert } from "assert";
import { isInPerformanceTestingMode } from "@fluid-tools/benchmark";
import { TransactionResult } from "../../checkout";
import { emptyField, FieldKinds, singleTextCursor } from "../../feature-libraries";
// import { PlacePath } from "../../feature-libraries/sequence-change-family";
import { moveToDetachedField } from "../../forest";
import { fieldSchema, namedTreeSchema, SchemaData, ValueSchema } from "../../schema-stored";
import { ISharedTree } from "../../shared-tree";
import { FieldKey, JsonableTree, rootFieldKey, rootFieldKeySymbol, Value } from "../../tree";
import { brand } from "../../util";
import { ITestTreeProvider, TestTreeProvider } from "../utils";


const stringSchema = namedTreeSchema({
    name: brand("String"),
    extraLocalFields: emptyField,
    value: ValueSchema.String,
});

export const childSchema = namedTreeSchema({
    name: brand("Test:Opsize-Bench-Child"),
    localFields: {
        data: fieldSchema(FieldKinds.value, [stringSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const parentSchema = namedTreeSchema({
    name: brand("Test:Opsize-Bench-Root"),
    localFields: {
        children: fieldSchema(FieldKinds.sequence, [childSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const rootSchema = fieldSchema(FieldKinds.value, [parentSchema.name]);

export const fullSchemaData: SchemaData = {
    treeSchema: new Map([
        [stringSchema.name, stringSchema],
        [parentSchema.name, parentSchema],
    ]),
    globalFieldSchema: new Map([
        [rootFieldKey, rootSchema],
    ]),
};

const initialTestJsonTree = {
    type: parentSchema.name,
    fields: {
        children: []
    }
}

/*
 * Updates the given `tree` to the given `schema` and inserts `state` as its root.
 */
function initializeTestTree(
    tree: ISharedTree,
    state: JsonableTree = initialTestJsonTree
) {
    tree.storedSchema.update(fullSchemaData);
    // inserts a node with the initial AppState as the root of the tree
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor(state);
        const field = editor.sequenceField(undefined, rootFieldKeySymbol);
        field.insert(0, writeCursor);
        return TransactionResult.Apply;
    });
}

const getJsonNode = (desiredByteSize: number): JsonableTree => {
    const node = {
        type: childSchema.name,
        fields: {
            data: [{ value: "", type: stringSchema.name }],
        }
    };

    let nodeByteSize = new TextEncoder().encode(JSON.stringify(node)).length;

    const sizeIncrementor = 'a'; // 1 byte
    const incrementorByteSize = new TextEncoder().encode(sizeIncrementor).length;

    while (nodeByteSize < desiredByteSize) {
        node.fields.data[0].value += sizeIncrementor
        nodeByteSize += incrementorByteSize
    }

    return node;
}

const getChildrenlength = (tree: ISharedTree) => {
    const cursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, cursor);
    cursor.enterNode(0);
    cursor.enterField(childrenFieldKey)
    const length = cursor.getFieldLength();
    cursor.free();
    return length;
}

const assertChildNodeCount = (tree: ISharedTree, nodeCount: number) => {
    const cursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, cursor);
    cursor.enterNode(0);
    cursor.enterField(childrenFieldKey)
    assert.equal(cursor.getFieldLength(), nodeCount);
    cursor.free();
}

const assertChildValuesEqualExpected = (tree: ISharedTree, editPayload: Value, childCount: number) => {
    const cursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, cursor);
    cursor.enterNode(0);
    cursor.enterField(childrenFieldKey);
    cursor.enterNode(0);
    assert.equal(cursor.value, editPayload);

    let currChildCount = 1;
    while (cursor.nextNode() && currChildCount < childCount) {
        assert.equal(cursor.value, editPayload);
        currChildCount++;
    }
    cursor.free();
}

// Creates a json tree with the desired number of children and the size of each child in bytes.
const getInitialJsonTreeWithChildren = (numChildNodes: number, childNodeByteSize: number) => {
    const childNode = getJsonNode(childNodeByteSize);
    const jsonTree = {
        type: parentSchema.name,
        fields: {
            children: []
        }
    }
    for (let i = 0; i < numChildNodes; i++) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        jsonTree.fields.children.push({ ...childNode })
    }
    return jsonTree;
}

const insertNodesWithInvidualTransactions =
    async (tree: ISharedTree, provider: ITestTreeProvider, jsonNode: JsonableTree, count: number) => {
        for (let i = 0; i < count; i++) {
            tree.runTransaction((f, editor) => {
                const path = {
                    parent: undefined,
                    parentField: rootFieldKeySymbol,
                    parentIndex: 0,
                };
                const writeCursor = singleTextCursor(jsonNode);
                const field = editor.sequenceField(path, childrenFieldKey);
                field.insert(0, writeCursor);
                return TransactionResult.Apply;
            });
        }
        await provider.ensureSynchronized();
    }

const insertNodesWithSingleTransaction =
    async (tree: ISharedTree, provider: ITestTreeProvider, jsonNode: JsonableTree, count: number) => {
        tree.runTransaction((f, editor) => {
            const path = {
                parent: undefined,
                parentField: rootFieldKeySymbol,
                parentIndex: 0,
            };
            const field = editor.sequenceField(path, childrenFieldKey);
            for (let i = 0; i < count; i++) {
                field.insert(0, singleTextCursor(jsonNode));
            }
            return TransactionResult.Apply;
        });
        await provider.ensureSynchronized();
    }

const deleteNodesWithInvidualTransactions =
    async (tree: ISharedTree, provider: ITestTreeProvider, numDeletes: number, deletesPerTransaction: number) => {
        for (let i = 0; i < numDeletes; i++) {
            tree.runTransaction((f, editor) => {
                const path = {
                    parent: undefined,
                    parentField: rootFieldKeySymbol,
                    parentIndex: 0,
                };
                const field = editor.sequenceField(path, childrenFieldKey);
                field.delete(getChildrenlength(tree) - 1, deletesPerTransaction);
                return TransactionResult.Apply;
            });
            await provider.ensureSynchronized();
        }
    }

const deleteNodesWithSingleTransaction =
    async (tree: ISharedTree, provider: ITestTreeProvider, numDeletes: number) => {
        tree.runTransaction((f, editor) => {
            const path = {
                parent: undefined,
                parentField: rootFieldKeySymbol,
                parentIndex: 0,
            };
            const field = editor.sequenceField(path, childrenFieldKey);
            field.delete(0, numDeletes);
            return TransactionResult.Apply;
        });
        await provider.ensureSynchronized();
    }

const getEditPayloadInBytes = (numBytes: number) => {
    let payload = "";
    while (payload.length < numBytes) {
        payload += "a"
    }
    return payload;
}

const editNodesWithInvidualTransactions =
    async (tree: ISharedTree, provider: ITestTreeProvider, numChildrenToEdit: number, editPayload: Value) => {
        const rootPath = {
            parent: undefined,
            parentField: rootFieldKeySymbol,
            parentIndex: 0,
        };
        for (let i = 0; i < numChildrenToEdit; i++) {
            tree.runTransaction((f, editor) => {
                const childPath = {
                    parent: rootPath,
                    parentField: childrenFieldKey,
                    parentIndex: i
                };
                editor.setValue(childPath, editPayload);
                return TransactionResult.Apply;
            });
            await provider.ensureSynchronized();
        }
    }

const editNodesWithSingleTransaction =
    async (tree: ISharedTree, provider: ITestTreeProvider, numChildrenToEdit: number, editPayload: Value) => {
        const rootPath = {
            parent: undefined,
            parentField: rootFieldKeySymbol,
            parentIndex: 0,
        };
        tree.runTransaction((f, editor) => {
            for (let i = 0; i < numChildrenToEdit; i++) {
                const childPath = {
                    parent: rootPath,
                    parentField: childrenFieldKey,
                    parentIndex: i
                };
                editor.setValue(childPath, editPayload);
            }
            return TransactionResult.Apply;
        });
        await provider.ensureSynchronized();
    }




// pulled from packages/runtime/container-runtime/src/containerRuntime.ts
const defaultMaxBatchSizeInBytes = 950 * 1024;

const childrenFieldKey: FieldKey = brand('children');

const INSERT_BENCHMARK_PERCENTILES = {
    individualTransactions: {
        nodeCounts: {
            '100': {
                percentiles: {
                    '1%': {
                        byteSize: 90
                    },
                    '50%': {
                        byteSize: 4500
                    },
                    '99%': {
                        byteSize: 9000
                    }
                }
            }
        }
    },
    singleTransaction: {
        nodeCounts: {
            '100': {
                percentiles: {
                    '1%': {
                        byteSize: 97
                    },
                    '50%': {
                        byteSize: 4850
                    },
                    '99%': {
                        byteSize: 9700
                    }
                }
            }
        }
    }
} as const;

const DELETE_BENCHMARK_PERCENTILES = {
    individualTransactions: {
        nodeCounts: {
            '100': {
                percentiles: {
                    '1%': {
                        byteSize: 97
                    },
                    '50%': {
                        byteSize: 4850
                    },
                    '99%': {
                        byteSize: 9700
                    }
                }
            }
        }
    },
    singleTransaction: {
        nodeCounts: {
            '100': {
                percentiles: {
                    '1%': {
                        byteSize: 97
                    },
                    '50%': {
                        byteSize: 4850
                    },
                    '99%': {
                        byteSize: 9700
                    }
                }
            }
        }
    },
} as const;

// Edit benchmarks use 1/10 of the actual max sizes outside of perf mode because it takes so long to execute.
const EDIT_BENCHMARK_PERCENTILES = {
    individualTransactions: {
        nodeCounts: {
            '100': {
                percentiles: {
                    '1%': {
                        byteSize: isInPerformanceTestingMode ? 8000 : 800
                    },
                    '50%': {
                        byteSize: isInPerformanceTestingMode ? 400000 : 40000
                    },
                    '99%': {
                        byteSize: isInPerformanceTestingMode ? 800000 : 80000
                    }
                }

            }
        }
    },
    singleTransaction: {
        nodeCounts: {
            '100': {
                percentiles: {
                    '1%': {
                        byteSize: 86
                    },
                    '50%': {
                        byteSize: 4300
                    },
                    '99%': {
                        byteSize: 8600
                    }
                }
            }
        }
    },
} as const;

const BASE_BENCHMARK_NODE_COUNT = 100;

describe("SharedTree Op Size Benchmarks", () => {

    describe("1. Insert Nodes", () => {

        describe("1a. With Individual transactions", () => {
            /**
             * BASE_BENCHMARK_NODE_COUNT child nodes each with a size of ~9Kb in utf-8 encoded bytes of JsonableTree
             * was found to be the maximum size that could be successfully inserted using BASE_BENCHMARK_NODE_COUNT individual transactions
             * each containing 1 child node insertion.
             *
             * Using any larger of a byte size of JsonableTree children causes the "BatchToLarge" error; this would require either:
             * Adding artificial wait, for e.x. by using a for-loop to segment our transactions into batches of less than BASE_BENCHMARK_NODE_COUNT.
             * OR
             * Making the size in bytes of the children smaller.
             */

            it(`1a.a. ${BASE_BENCHMARK_NODE_COUNT} small nodes (~1% of max consistently successful size) in ${BASE_BENCHMARK_NODE_COUNT} transactions`, async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0]);
                const jsonNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize)
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, jsonNode, BASE_BENCHMARK_NODE_COUNT);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);
            });

            it(`1a.b. ${BASE_BENCHMARK_NODE_COUNT} medium nodes (~50% of max consistently successful size) in ${BASE_BENCHMARK_NODE_COUNT} transactions`, async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0]);
                const jsonNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize)
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, jsonNode, BASE_BENCHMARK_NODE_COUNT);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);
            });

            it(`1a.c. ${BASE_BENCHMARK_NODE_COUNT} large nodes (~99% of max consistently successful size) in ${BASE_BENCHMARK_NODE_COUNT} transactions`, async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0]);
                const jsonNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize)
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, jsonNode, BASE_BENCHMARK_NODE_COUNT);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);
            });
        });

        describe("1b. With one transaction", () => {
            /**
             * 100 child nodes each with a size of ~9.7Kb in utf-8 encoded bytes of JsonableTree
             * was found to be the maximum size that could be successfully inserted using 1 transaction
             * containing 100 insertions of 1 child node.
             *
             * Using any larger of a byte size of JsonableTree children causes the "BatchToLarge" error; this would require either:
             * Adding artificial wait, for e.x. by using a for-loop to segment our transactions into batches of less than 100.
             * OR
             * Making the size in bytes of the children smaller.
             */

            it(`1b.a. ${BASE_BENCHMARK_NODE_COUNT} small nodes (~1% of max consistently successful size)`, async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0]);
                const jsonNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.singleTransaction.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize);
                await insertNodesWithSingleTransaction(provider.trees[0], provider, jsonNode, BASE_BENCHMARK_NODE_COUNT);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);
            });

            it(`1b.b. ${BASE_BENCHMARK_NODE_COUNT} medium nodes (~50% of max consistently successful size)`, async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0]);
                const jsonNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.singleTransaction.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize);
                await insertNodesWithSingleTransaction(provider.trees[0], provider, jsonNode, BASE_BENCHMARK_NODE_COUNT);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);
            });


            it(`1b.c. ${BASE_BENCHMARK_NODE_COUNT} large nodes (~99% of max consistently successful size)`, async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0]);
                const jsonNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.singleTransaction.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize);
                await insertNodesWithSingleTransaction(provider.trees[0], provider, jsonNode, BASE_BENCHMARK_NODE_COUNT);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);
            });
        });

        // describe("Insert subtrees in one transaction", () => {
        //     // 1. insert subtree with 100 nodes (X) bytes in 1 transaction
        //     // 1. insert subtree with 10000 nodes (X) bytes in 1 transaction
        //     // 1. insert subtree with 1000000 nodes (X) bytes in 1 transaction
        // });
    });

    describe("2. Delete Nodes", () => {

        describe("2a. With Individual transactions", () => {
            /**
             * A tree with 100 child nodes each with a size of ~9.7Kb in utf-8 encoded bytes of JsonableTree
             * was found to be the maximum size that could be successfully deleted using 100 transactions
             * each containing 1 child node deletion.
             *
             * Using any larger of a byte size of JsonableTree children causes the "BatchToLarge" error; this would require either:
             * Adding artificial wait, for e.x. by using a for-loop to segment our transactions into batches of less than 100.
             * OR
             * Making the size in bytes of the children smaller.
             */

            it("2a.a. 100 small nodes (~1% of max consistently successful size) in 100 transactions each containing 1 delete", async () => {
                const provider = await TestTreeProvider.create(1);
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(100, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, 100, 1);
                assertChildNodeCount(provider.trees[0], 0);
            });

            it("2a.b. 100 medium nodes (~50% of max consistently successful size) in 100 transactions each containing 1 delete", async () => {
                const provider = await TestTreeProvider.create(1);
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(100, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, 100, 1);
                assertChildNodeCount(provider.trees[0], 0);
            });

            it("2a.c. 100 large nodes (~99% of max consistently successful size) in 100 transactions each containing 1 delete", async () => {
                const provider = await TestTreeProvider.create(1);
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(100, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, 100, 1);
                assertChildNodeCount(provider.trees[0], 0);
            });
        });

        describe("2b. With Single transaction", () => {
            /**
             * A tree with 100 child nodes each with a size of ~9.7Kb in utf-8 encoded bytes of JsonableTree
             * was found to be the maximum size that could be successfully deleted in 1 transaction
             * containing 100 deletes.
             *
             * Using any larger of a byte size of JsonableTree children causes the "BatchToLarge" error; this would require either:
             * Adding artificial wait, for e.x. by using a for-loop to segment our transactions into batches of less than 100.
             * OR
             * Making the size in bytes of the children smaller.
             */

            it("2b.a. 100 small nodes (~1% of max consistently successful size) in 1 transaction containing 1 delete of 100 nodes", async () => {
                const provider = await TestTreeProvider.create(1);
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(100, childByteSize));
                await deleteNodesWithSingleTransaction(provider.trees[0], provider, 100);
                assertChildNodeCount(provider.trees[0], 0);
            });

            it("2b.b. 100 medium nodes (~50% of max consistently successful size) in 1 transactions containing 1 delete of 100 nodes", async () => {
                const provider = await TestTreeProvider.create(1);
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(100, childByteSize));
                await deleteNodesWithSingleTransaction(provider.trees[0], provider, 100);
                assertChildNodeCount(provider.trees[0], 0);
            });

            it("2b.c. 100 large nodes (~99% of max consistently successful size) in 1 transactions containing 1 delete of 100 nodes", async () => {
                const provider = await TestTreeProvider.create(1);
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(100, childByteSize));
                await deleteNodesWithSingleTransaction(provider.trees[0], provider, 100);
                assertChildNodeCount(provider.trees[0], 0);
            });
        });


        //     describe("Delete subtrees in one transaction", () => {
        //         // 1. delete subtree with 100 nodes (X) bytes in 1 transaction
        //         // 1. delete subtree with 10000 nodes (X) bytes in 1 transaction
        //         // 1. delete subtree with 1000000 nodes (X) bytes in 1 transaction
        //     });
    });

    describe("3. Edit Nodes", () => {

        describe("3a. With Individual transactions", () => {
            /**
             * Editing the children of a tree with a payload of larger than 800 Kb yielded inconsistent success
             * when editing each child with invidiual transactions.
             * 800Kb was found to be the largest consistently successful edit payload.
             *
             * Using any larger of a byte size of JsonableTree children causes the "BatchToLarge" error; this would require either:
             * Adding artificial wait, for e.x. by using a for-loop to segment our transactions into batches of less than 100.
             * OR
             * Making the size in bytes of the children smaller.
             */

            it(`3a.a. ${BASE_BENCHMARK_NODE_COUNT} small edits (~1% of max consistently successful size) in 100 transactions containing 1 edit`, async () => {
                const provider = await TestTreeProvider.create(1)
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, 1000));
                const editPayload = getEditPayloadInBytes(EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize);
                await editNodesWithInvidualTransactions(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, BASE_BENCHMARK_NODE_COUNT)
            });

            it(`3a.b. ${BASE_BENCHMARK_NODE_COUNT} medium edits (~50% of max consistently successful size) in 100 transactions containing 1 edit`, async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, 1000));
                const editPayload = getEditPayloadInBytes(EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize);
                await editNodesWithInvidualTransactions(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, BASE_BENCHMARK_NODE_COUNT)
            });

            it(`3a.c. ${BASE_BENCHMARK_NODE_COUNT} large edits (~99% of max consistently successful size) in 100 transactions containing 1 edit`, async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, 1000));
                const editPayload = getEditPayloadInBytes(EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize);
                await editNodesWithInvidualTransactions(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, BASE_BENCHMARK_NODE_COUNT)
            });
        });

        describe("3b. With Single transaction", () => {
            /**
             * Editing the children of a tree with a payload of larger than 8.6 Kb yielded inconsistent success.
             * 8.6kb was found to be the largest consistently successful edit payload when.
             *
             * Using any larger of a byte size of JsonableTree children causes the "BatchToLarge" error; this would require either:
             * Adding artificial wait, for e.x. by using a for-loop to segment our transactions into batches of less than 100.
             * OR
             * Making the size in bytes of the children smaller.
             */

            it(`3b.a. ${BASE_BENCHMARK_NODE_COUNT} small edits (~1% of max consistently successful size) in 1 transaction containing 100 edits`, async () => {
                const provider = await TestTreeProvider.create(1)
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, 1000));
                const editPayload = getEditPayloadInBytes(EDIT_BENCHMARK_PERCENTILES.singleTransaction.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize);
                await editNodesWithSingleTransaction(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, BASE_BENCHMARK_NODE_COUNT)

            });

            it(`3b.b. ${BASE_BENCHMARK_NODE_COUNT} medium edits (~50% of max consistently successful size) in 1 transaction containing 100 edits`, async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, 1000));
                const editPayload = getEditPayloadInBytes(EDIT_BENCHMARK_PERCENTILES.singleTransaction.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize);
                await editNodesWithSingleTransaction(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, BASE_BENCHMARK_NODE_COUNT)
            });

            it(`3b.c. ${BASE_BENCHMARK_NODE_COUNT} large edits (~99% of max consistently successful size) in 1 transaction containing 100 edits`, async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, 1000));
                const editPayload = getEditPayloadInBytes(EDIT_BENCHMARK_PERCENTILES.singleTransaction.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize);
                await editNodesWithSingleTransaction(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, BASE_BENCHMARK_NODE_COUNT)
            });
        });

        //     describe("Subtrees in one transaction", () => {
        //         // 1. edit subtree with 100 nodes (X) bytes in 1 transaction
        //         // 1. edit subtree with 10000 nodes (X) bytes in 1 transaction
        //         // 1. edit subtree with 1000000 nodes (X) bytes in 1 transaction
        //     });
    });


    describe("4. Insert, Delete & Edit Nodes", () => {

        describe("4a. With individual transactions and an equal distribution of operation type", () => {
            it(`4a.a. insert ${BASE_BENCHMARK_NODE_COUNT} small nodes, delete ${BASE_BENCHMARK_NODE_COUNT} small nodes, edit ${BASE_BENCHMARK_NODE_COUNT} nodes with small payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, 1);
                assertChildNodeCount(provider.trees[0], 0);

                // insert
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, BASE_BENCHMARK_NODE_COUNT);
                assertChildNodeCount(provider.trees[0], 100);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, BASE_BENCHMARK_NODE_COUNT);
            });

            it(`4a.b. insert ${BASE_BENCHMARK_NODE_COUNT} medium nodes, delete ${BASE_BENCHMARK_NODE_COUNT} medium nodes, edit ${BASE_BENCHMARK_NODE_COUNT} nodes with medium payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, 1);
                assertChildNodeCount(provider.trees[0], 0);

                // insert
                initializeTestTree(provider.trees[0]);
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, BASE_BENCHMARK_NODE_COUNT);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, BASE_BENCHMARK_NODE_COUNT);
            });

            it(`4a.c. insert ${BASE_BENCHMARK_NODE_COUNT} large nodes, delete ${BASE_BENCHMARK_NODE_COUNT} large medium, edit ${BASE_BENCHMARK_NODE_COUNT} nodes with large payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, 1);
                assertChildNodeCount(provider.trees[0], 0);

                // insert
                initializeTestTree(provider.trees[0]);
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, BASE_BENCHMARK_NODE_COUNT);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, BASE_BENCHMARK_NODE_COUNT, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, BASE_BENCHMARK_NODE_COUNT);
            });
        });

        describe("4b. In individual transactions with 70% distribution of operations towards insert", () => {

            const seventyPercentCount = BASE_BENCHMARK_NODE_COUNT * 0.70;
            const fifteenPercentCount = BASE_BENCHMARK_NODE_COUNT * 0.15;

            it(`4b.a. insert ${seventyPercentCount} small nodes, delete ${fifteenPercentCount} small nodes, edit ${fifteenPercentCount} nodes with small payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(fifteenPercentCount, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, 1);
                assertChildNodeCount(provider.trees[0], 0);

                // insert
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, seventyPercentCount);
                assertChildNodeCount(provider.trees[0], seventyPercentCount);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, fifteenPercentCount);
            });

            it(`4b.b. insert ${seventyPercentCount} medium nodes, delete ${fifteenPercentCount} medium nodes, edit ${fifteenPercentCount} nodes with medium payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(fifteenPercentCount, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, 1);
                assertChildNodeCount(provider.trees[0], 0);

                // insert
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, seventyPercentCount);
                assertChildNodeCount(provider.trees[0], seventyPercentCount);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, fifteenPercentCount);
            });

            it(`4b.b. insert ${seventyPercentCount} large nodes, delete ${fifteenPercentCount} large nodes, edit ${fifteenPercentCount} nodes with large payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(fifteenPercentCount, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, 1);
                assertChildNodeCount(provider.trees[0], 0);

                // insert
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, seventyPercentCount);
                assertChildNodeCount(provider.trees[0], seventyPercentCount);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, fifteenPercentCount);
            });
        });

        describe("4c. In individual transactions with 70% distribution of operations towards delete", () => {

            const seventyPercentCount = BASE_BENCHMARK_NODE_COUNT * 0.70;
            const fifteenPercentCount = BASE_BENCHMARK_NODE_COUNT * 0.15;

            it(`4c.a. insert ${fifteenPercentCount} small nodes, delete ${seventyPercentCount} small nodes, edit ${fifteenPercentCount} nodes with small payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(seventyPercentCount, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, seventyPercentCount, 1);
                assertChildNodeCount(provider.trees[0], 0);

                // insert
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, fifteenPercentCount);
                assertChildNodeCount(provider.trees[0], fifteenPercentCount);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, fifteenPercentCount);
            });

            it(`4c.b. insert ${fifteenPercentCount} medium nodes, delete ${seventyPercentCount} medium nodes, edit ${fifteenPercentCount} nodes with medium payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(seventyPercentCount, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, seventyPercentCount, 1);
                assertChildNodeCount(provider.trees[0], 0);

                // insert
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, fifteenPercentCount);
                assertChildNodeCount(provider.trees[0], fifteenPercentCount);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, fifteenPercentCount);
            });

            it(`4c.b. insert ${fifteenPercentCount} large nodes, delete ${seventyPercentCount} large nodes, edit ${fifteenPercentCount} nodes with large payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(seventyPercentCount, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, seventyPercentCount, 1);
                assertChildNodeCount(provider.trees[0], 0);

                // insert
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, fifteenPercentCount);
                assertChildNodeCount(provider.trees[0], fifteenPercentCount);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, fifteenPercentCount);
            });
        });

        describe("4d. In individual transactions with 70% distribution of operations towards edit", () => {

            const seventyPercentCount = BASE_BENCHMARK_NODE_COUNT * 0.70;
            const fifteenPercentCount = BASE_BENCHMARK_NODE_COUNT * 0.15;

            it(`4d.a. insert ${fifteenPercentCount} small nodes, delete ${fifteenPercentCount} small nodes, edit ${seventyPercentCount} nodes with small payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, 1);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT - fifteenPercentCount);

                // insert
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, fifteenPercentCount);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["1%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, seventyPercentCount, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, seventyPercentCount);
            });

            it(`4d.b. insert ${fifteenPercentCount} medium nodes, delete ${fifteenPercentCount} medium nodes, edit ${seventyPercentCount} nodes with medium payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, 1);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT - fifteenPercentCount);

                // insert
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, fifteenPercentCount);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["50%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, seventyPercentCount, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, seventyPercentCount);
            });

            it(`4d.c. insert ${fifteenPercentCount} large nodes, delete ${seventyPercentCount} large nodes, edit ${seventyPercentCount} nodes with large payloads`, async () => {
                const provider = await TestTreeProvider.create(1)
                // delete
                const childByteSize = DELETE_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize;
                initializeTestTree(provider.trees[0], getInitialJsonTreeWithChildren(BASE_BENCHMARK_NODE_COUNT, childByteSize));
                await deleteNodesWithInvidualTransactions(provider.trees[0], provider, fifteenPercentCount, 1);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT - fifteenPercentCount);

                // insert
                const insertChildNode = getJsonNode(INSERT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize);
                await insertNodesWithInvidualTransactions(provider.trees[0], provider, insertChildNode, fifteenPercentCount);
                assertChildNodeCount(provider.trees[0], BASE_BENCHMARK_NODE_COUNT);

                // edit
                const editPayload = getEditPayloadInBytes(
                    EDIT_BENCHMARK_PERCENTILES.individualTransactions.nodeCounts[`${BASE_BENCHMARK_NODE_COUNT}`].percentiles["99%"].byteSize
                );
                await editNodesWithInvidualTransactions(provider.trees[0], provider, seventyPercentCount, editPayload);
                assertChildValuesEqualExpected(provider.trees[0], editPayload, seventyPercentCount);
            });
        });
    });

});
