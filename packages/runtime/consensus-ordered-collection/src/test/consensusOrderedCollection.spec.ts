import * as assert from "assert";
import { ConsensusQueueExtension, ConsensusStackExtension } from "../extension";
import { IConsensusOrderedCollection, IConsensusOrderedCollectionExtension } from "../interfaces";

describe("Routerlicious", () => {
    describe("Api", () => {
        // tslint:disable:mocha-no-side-effect-code
        generate("ConsensusQueue", new ConsensusQueueExtension(), [1, 2], [1, 2]);
        generate("ConsensusStack", new ConsensusStackExtension(), [1, 2], [2, 1]);
        function generate(
            name: string,
            extension: IConsensusOrderedCollectionExtension,
            input: any[],
            output: any[]) {

            describe(name, () => {
                let testCollection: IConsensusOrderedCollection;

                beforeEach(async () => {
                    testCollection = extension.create(null, "consensus-ordered-collection");
                });

                it("Can create a collection", () => {
                    assert.ok(testCollection);
                });

                it("Can add and remove data", async () => {
                    assert.strictEqual(await testCollection.remove(), undefined);
                    await testCollection.add("testValue");
                    assert.strictEqual(await testCollection.remove(), "testValue");
                });

                it("Can wait for data", async () => {
                    let added = false;
                    const p = testCollection.waitAndRemove();
                    p.then((value) => {
                        assert(added, "Wait resolved before value is added");
                    })
                        .catch((reason) => {
                            assert(false, "Unexpected promise rejection");
                        });

                    added = true;
                    await testCollection.add("testValue");
                    assert.strictEqual(await p, "testValue");
                });

                it("Data ordering", async () => {
                    for (const item of input) {
                        await testCollection.add(item);
                    }

                    for (const item of output) {
                        assert.strictEqual(await testCollection.remove(), item);
                    }
                    assert.strictEqual(await testCollection.remove(), undefined,
                        "Remove from empty collection should undefined");
                });

                it("Event", async () => {
                    let addCount = 0;
                    let removeCount = 0;
                    testCollection.on("add", (value) => {
                        assert.strictEqual(value, input[addCount], "Added event value not matched");
                        addCount += 1;
                    });
                    testCollection.on("remove", (value) => {
                        assert.strictEqual(value, output[removeCount], "Remove event value not matched");
                        removeCount += 1;
                    });
                    for (const item of input) {
                        await testCollection.add(item);
                    }
                    let count = output.length;
                    while (count > 0) {
                        await testCollection.remove();
                        count -= 1;
                    }
                    assert.strictEqual(await testCollection.remove(), undefined,
                        "Remove from empty collection should undefined");

                    assert.strictEqual(addCount, input.length, "Incorrect number add event");
                    assert.strictEqual(removeCount, output.length, "Incorrect number remove event");
                });

                it("Object value needs to be cloned", async () => {
                    const testCollection2: IConsensusOrderedCollection<{ x: number }> = testCollection;
                    const obj = { x: 1 };
                    await testCollection2.add(obj);
                    const result = await testCollection2.remove();
                    assert.notStrictEqual(result, obj);
                    assert.strictEqual(result.x, 1);
                });
            });
        }
    });
});
