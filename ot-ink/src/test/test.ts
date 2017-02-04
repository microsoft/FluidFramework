import * as assert from "assert";
import * as ink from "../";

function assertShouldThrow(operation: Function) {
    let threw = false;

    try {
        operation();
    } catch (exception) {
        threw = true;
    }

    assert(threw);
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
        it("Can apply a move", () => {
            let id = "test";

            let snapshot = new ink.Snapshot();
            let operation: ink.IOperation = {
                stylusDown: {
                    id,
                    layer: 0,
                    pen: null,
                    point: { x: 10, y: 20 },
                    pressure: 100,
                },
                time: new Date().getTime(),
            };

            snapshot.apply({ operation });

            assert.equal(snapshot.layers.length, 1);
            assert.equal(snapshot.layerIndex[id].id, id);
            assert.equal(snapshot.layerIndex[id].operations.length, 1);
            assert.equal(snapshot.layerIndex[id].operations[0], operation);
        });
    });

    describe("transform", () => {
        it("should return -1 when the value is not present", () => {
            assert.equal(-1, [1, 2, 3].indexOf(4));
        });
    });
});
