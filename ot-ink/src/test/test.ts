import * as assert from "assert";
import * as ink from "../";

let testPen: ink.IPen = {
    color: { r: 0.1, g: 0, b: 0, a: 1 },
    thickness: 10,
};

function assertShouldThrow(operation: Function) {
    let threw = false;

    try {
        operation();
    } catch (exception) {
        threw = true;
    }

    assert(threw);
}

function renderLayer(snapshot: ink.Snapshot) {
    let downDelta = new ink.Delta().stylusDown(
        { x: 10, y: 20 },
        100,
        testPen);
    let id = downDelta.operations[0].stylusDown.id;
    let moveDelta = new ink.Delta().stylusMove({ x: 20, y: 25 }, 200, id);
    let upDelta = new ink.Delta().stylusUp({ x: 20, y: 25 }, 200, id);

    snapshot.apply(downDelta);
    snapshot.apply(moveDelta);
    snapshot.apply(upDelta);
}

describe("Ink", () => {
    describe("create", () => {
        it("should be able to create a new snapshot", () => {
            let snapshot = ink.type.create({ layers: [], layerIndex: {} });
            assert(snapshot instanceof ink.Snapshot);
        });

        it("Invalid initial state should fail", () => {
            assertShouldThrow(() => ink.type.create(null));
            assertShouldThrow(() => ink.type.create({ layers: null, layerIndex: {} }));
            assertShouldThrow(() => ink.type.create({ layers: [], layerIndex: null }));
        });
    });

    describe("apply", () => {
        it("can apply a stylus down", () => {
            let snapshot = new ink.Snapshot();
            let delta = new ink.Delta().stylusDown(
                { x: 10, y: 20 },
                100,
                testPen);
            let id = delta.operations[0].stylusDown.id;

            snapshot.apply(delta);

            assert.equal(snapshot.layers.length, 1);
            let layerIndex = snapshot.layerIndex[id];
            assert.equal(layerIndex, 0);
            assert.equal(snapshot.layers[layerIndex].id, id);
            assert.equal(snapshot.layers[layerIndex].operations.length, 1);
            assert.equal(snapshot.layers[layerIndex].operations[0], delta.operations[0]);
        });

        it("can render multiple layers", () => {
            let snapshot = new ink.Snapshot();
            renderLayer(snapshot);
            renderLayer(snapshot);
            renderLayer(snapshot);

            // should have three layers with three operations
            assert.equal(snapshot.layers.length, 3);
            assert.equal(snapshot.layers[0].operations.length, 3);
        });

        it("can clear the canvas", () => {
            let snapshot = new ink.Snapshot();
            renderLayer(snapshot);
            assert.equal(snapshot.layers.length, 1);

            let clear = new ink.Delta().clear();
            snapshot.apply(clear);
            assert.equal(snapshot.layers.length, 0);
        });

        it("can clear the canvas", () => {
            let snapshot = new ink.Snapshot();
            let clearSnapshot = ink.type.apply(snapshot, new ink.Delta().clear());
            assert(clearSnapshot !== snapshot);
        });
    });

    describe("transform", () => {
        it("can apply two mouse downs", () => {
            let firstDown = new ink.Delta().stylusDown(
                { x: 10, y: 20 },
                100,
                testPen);

            let secondDown = new ink.Delta().stylusDown(
                { x: 10, y: 20 },
                100,
                testPen);

            let transformedLeft = ink.type.transform(firstDown, secondDown, "left");
            let transformedRight = ink.type.transform(firstDown, secondDown, "right");

            // Should still result in a stylus down
            assert(transformedLeft.operations[0].stylusDown);
            assert(transformedRight.operations[0].stylusDown);

            // But the layer should now be oe up
            assert.equal(transformedLeft.operations[0].stylusDown.layer, 1);
            assert.equal(transformedRight.operations[0].stylusDown.layer, 0);

            // Apply the operations and validate layer creation
            let snapshotLeft = new ink.Snapshot();
            snapshotLeft.apply(secondDown);
            snapshotLeft.apply(transformedLeft);
            assert.equal(snapshotLeft.layers.length, 2);
            assert.equal(snapshotLeft.layers[0].operations[0], transformedLeft.operations[0]);
            assert.equal(snapshotLeft.layers[1].operations[0], secondDown.operations[0]);

            let snapshotRight = new ink.Snapshot();
            snapshotRight.apply(secondDown);
            snapshotRight.apply(transformedRight);
            assert.equal(snapshotRight.layers.length, 2);
            assert.equal(snapshotRight.layers[1].operations[0], transformedRight.operations[0]);
            assert.equal(snapshotRight.layers[0].operations[0], secondDown.operations[0]);
        });

        it("can transform move/up", () => {
            let first = new ink.Delta().stylusMove(
                { x: 10, y: 20 },
                100);
            let second = new ink.Delta().stylusUp(
                { x: 10, y: 20 },
                100);

            let transformedLeft = ink.type.transform(first, second, "left");
            let transformedRight = ink.type.transform(first, second, "right");

            // Should still result in a stylus down
            assert(transformedLeft.operations[0].stylusMove);
            assert(transformedRight.operations[0].stylusMove);
        });

        it("clears propagate", () => {
            let clear = new ink.Delta().clear();
            let action = new ink.Delta().stylusUp(
                { x: 10, y: 20 },
                100);

            let transformedLeft = ink.type.transform(action, clear, "left");
            let transformedRight = ink.type.transform(clear, action, "right");

            // Should still result in a stylus down
            assert(transformedLeft.operations[0].clear);
            assert(transformedRight.operations[0].clear);
        });
    });
});
