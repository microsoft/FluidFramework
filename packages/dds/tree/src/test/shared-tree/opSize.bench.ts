// import { strict as assert } from "assert";
// import { IRandom, makeRandom } from "@fluid-internal/stochastic-test-utils";
// import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
describe("SharedTree Op Size Benchmarks", () => {

    describe("Insert", () => {
        describe("Insert nodes in individual transactions", () => {
            // 1. insert 1000 small nodes (X) bytes in 1000 transaction
            // 1. insert 1000 medium nodes (X) bytes in 1000 transaction
            // 1. insert 1000 large nodes (X) bytes in 1000 transaction
        });

        describe("Insert nodes in one transaction", () => {
            // 1. insert 1000 small nodes (X) bytes in 1 transaction
            // 1. insert 1000 medium nodes (X) bytes in 1 transaction
            // 1. insert 1000 large nodes (X) bytes in 1 transaction
        });

        describe("Insert subtrees in one transaction", () => {
            // 1. insert subtree with 100 nodes (X) bytes in 1 transaction
            // 1. insert subtree with 10000 nodes (X) bytes in 1 transaction
            // 1. insert subtree with 1000000 nodes (X) bytes in 1 transaction
        });
    });

    describe("Delete", () => {
        describe("Delete nodes in individual transactions", () => {
            // 1. delete 1000 small nodes (X) bytes in 1000 transaction
            // 1. delete 1000 medium nodes (X) bytes in 1000 transaction
            // 1. delete 1000 large nodes (X) bytes in 1000 transaction
        });

        describe("Insert nodes in one transaction", () => {
            // 1. delete 1000 small nodes (X) bytes in 1 transaction
            // 1. delete 1000 medium nodes (X) bytes in 1 transaction
            // 1. delete 1000 large nodes (X) bytes in 1 transaction
        });

        describe("Delete subtrees in one transaction", () => {
            // 1. delete subtree with 100 nodes (X) bytes in 1 transaction
            // 1. delete subtree with 10000 nodes (X) bytes in 1 transaction
            // 1. delete subtree with 1000000 nodes (X) bytes in 1 transaction
        });
    });

    describe("Edit", () => {
        describe("Nodes in individual transactions", () => {
            // 1. edit 1000 small nodes (X) bytes in 1000 transaction
            // 1. edit 1000 medium nodes (X) bytes in 1000 transaction
            // 1. edit 1000 large nodes (X) bytes in 1000 transaction
        });

        describe("Nodes in one transaction", () => {
            // 1. edit 1000 small nodes (X) bytes in 1 transaction
            // 1. edit 1000 medium nodes (X) bytes in 1 transaction
            // 1. edit 1000 large nodes (X) bytes in 1 transaction
        });

        describe("Subtrees in one transaction", () => {
            // 1. edit subtree with 100 nodes (X) bytes in 1 transaction
            // 1. edit subtree with 10000 nodes (X) bytes in 1 transaction
            // 1. edit subtree with 1000000 nodes (X) bytes in 1 transaction
        });
    });


    describe("Insert, Delete & Edit", () => {

        describe("Nodes in individual transactions ", () => {
            // 1. insert 333 small nodes, delete 333 small nodes, edit 333 small nodes in individual transactions
            // (equal, 30% distribution)

            // 2. insert 700 small nodes, delete 150 small nodes, edit 150 small nodes in individual transactions
            // (70% distribution towards insertion) (All permutations of operation orders tested)

            // 3. insert 150 small nodes, delete 700 small nodes, edit 150 small nodes in individual transactions
            // (70% distribution towards delete) (All permutations of operation orders tested)

            // 4. insert 150 small nodes, delete 150 small nodes, edit 700 small nodes in individual transactions
            // (70% distribution towards edit) (All permutations of operation orders tested)
        });

        describe("Nodes in single transactions ", () => {
            // 1. insert 333 small nodes, delete 333 small nodes, edit 333 small nodes in single transactions
            // (equal, 30% distribution)

            // 2. insert 700 small nodes, delete 150 small nodes, edit 150 small nodes in single transactions
            // (70% distribution towards insertion) (All permutations of operation orders tested)

            // 3. insert 150 small nodes, delete 700 small nodes, edit 150 small nodes in single transactions
            // (70% distribution towards delete) (All permutations of operation orders tested)

            // 4. insert 150 small nodes, delete 150 small nodes, edit 700 small nodes in single transactions
            // (70% distribution towards edit) (All permutations of operation orders tested)
        });

    });



})


// benchmark({
//     type: BenchmarkType.Measurement,
//     title: `Deep Tree as JS Object (${TestPrimitives[dataType]}): reads with ${i} nodes`,
//     before: async () => {
//         tree = getTestTreeAsJSObject(i, TreeShape.Deep, dataType);
//     },
//     benchmarkFn: () => {
//         readTreeAsJSObject(tree);
//     },
// });
