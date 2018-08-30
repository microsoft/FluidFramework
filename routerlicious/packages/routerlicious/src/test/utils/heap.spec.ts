import * as assert from "assert";
import * as _ from "lodash";
import { Heap, IComparer, IHeapNode, NumberComparer } from "../../utils";

function insertAll<T>(heap: Heap<T>, values: T[]) {
    for (const value of values) {
        heap.add(value);
    }
}

function verifyChild<T>(
    index: number,
    heap: Array<IHeapNode<T>>,
    firstChild: boolean,
    comparer: IComparer<T>): boolean {

    const childIndex = index * 2 + (firstChild ? 0 : 1);
    if (childIndex >= heap.length) {
        return true;
    }

    const parent = heap[index];
    const child = heap[childIndex];

    const local = parent.position === index
        && child.position === childIndex
        && comparer.compare(parent.value, child.value) <= 0;

    return local && verifyHeapCore(childIndex, heap, comparer);
}

function verifyHeapCore<T>(index: number, heap: Array<IHeapNode<T>>, comparer: IComparer<T>): boolean {
    if (index >= heap.length) {
        return true;
    }

    return verifyChild(index, heap, true, comparer) && verifyChild(index, heap, false, comparer);
}

function verifyHeap<T>(heap: Heap<T>) {
    assert.ok(verifyHeapCore(1, heap.L, heap.comp));
}

/**
 * Removes the element at the given index from the heap. Assumes all values are unique so that we can validate
 * it was removed from the heap.
 */
function removeAndVerify<T>(heap: Heap<T>, index: number, comparer: IComparer<T>) {
    const value = heap.L[index];
    const startSize = heap.count();
    heap.remove(value);
    assert.equal(heap.count(), startSize - 1);
    verifyHeap(heap);
    for (let i = 1; i < heap.L.length; i++) {
        assert.ok(comparer.compare(heap.L[i].value, value.value) !== 0);
    }
}

describe("Routerlicious", () => {
    describe("Utils", () => {
        describe("Heap", () => {
            let heap: Heap<number>;

            beforeEach(() => {
                heap = new Heap<number>(NumberComparer);
            });

            describe(".peek()", () => {
                it("Should return minimum value but not remove", () => {
                    const values = [2, 6, 4, 5];
                    insertAll(heap, values);

                    const min = _.min(values);
                    assert.equal(heap.count(), values.length);
                    const peekNode = heap.peek();
                    assert.equal(peekNode.position, 1);
                    assert.equal(peekNode.value, min);
                    assert.equal(heap.count(), values.length);
                    assert.equal(peekNode, heap.peek());
                });
            });

            describe(".get()", () => {
                it("Should return minimum value and remove", () => {
                    const values = [2, 6, 4, 5, 1];
                    insertAll(heap, values);
                    values.sort();
                    for (const value of values) {
                        assert.equal(value, heap.get());
                    }
                    assert.equal(heap.count(), 0);
                });
            });

            describe(".add()", () => {
                it("Should be able to add a value to the heap and maintain heap property", () => {
                    const values = [2, 6, 7, 8, 4, 3, 5, 1, 0, -1];
                    for (const value of values) {
                        const inserted = heap.add(value);
                        verifyHeap(heap);
                        assert.equal(inserted.value, value);
                        assert.equal(inserted, heap.L[inserted.position]);
                    }
                });
            });

            describe(".update()", () => {
                beforeEach(() => {
                    const values = [2, 6, 4, 5, 1];
                    insertAll(heap, values);
                });

                it("Should be able to decrease the value of an existing node", () => {
                    const value = heap.L[Math.floor(heap.L.length / 2)];
                    value.value = -100;
                    heap.update(value);
                    verifyHeap(heap);
                });

                it("Should be able to increase the value of an existing node", () => {
                    const value = heap.L[Math.floor(heap.L.length / 2)];
                    value.value = 100;
                    heap.update(value);
                    verifyHeap(heap);
                });
            });

            describe(".remove()", () => {
                it("Should be able to remove an element from the heap", () => {
                    const values = [2, 6, 7, 8, 4, 3, 5, 1, 0, -1];
                    insertAll(heap, values);

                    // Remove from the end
                    removeAndVerify(heap, heap.L.length - 1, NumberComparer);

                    // Remove from the beginning
                    removeAndVerify(heap, 1, NumberComparer);

                    // Remove from the middle
                    removeAndVerify(heap, Math.floor(heap.L.length / 2), NumberComparer);

                    // And then remove everything else
                    while (heap.count() > 0) {
                        removeAndVerify(heap, 1, NumberComparer);
                    }
                });
            });
        });
    });
});
