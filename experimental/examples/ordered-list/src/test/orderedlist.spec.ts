/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { Serializable } from "@fluidframework/datastore-definitions";
import { OrderedList, Position } from "..";

class TestFixture<T> {
    private readonly expected: { position: Position, item: T }[] = [];

    constructor(private readonly actual: OrderedList<T>) {}

    public expect(expected?: T[]) {
        const actualItems = this.actual.positions.map((position) => this.actual.get(position));
        assert.deepEqual(actualItems, this.expected.map((entry) => entry.item),
            "Actual items must be consistent with expected items computed by TestFixture.");

        if (expected !== undefined) {
            assert.deepEqual(actualItems, expected,
                "Actual items must match the items expected by test.");
        }
    }

    private findIndexOf(itemPosition: Position) {
        return this.expected.findIndex(({ position }) => position === itemPosition);
    }

    public insertBefore(position: Position, item: Serializable<T>): Position {
        const newPosition = this.actual.insertBefore(position, item);
        this.expected.splice(this.findIndexOf(position), /* deleteCount: */ 0, { position: newPosition, item });
        this.expect();
        return newPosition;
    }

    public insertAfter(position: Position, item: Serializable<T>): Position {
        const newPosition = this.actual.insertAfter(position, item);
        this.expected.splice(this.findIndexOf(position) + 1, /* deleteCount: */ 0, { position: newPosition, item });
        this.expect();
        return newPosition;
    }

    public insertFirst(item: Serializable<T>): Position {
        const newPosition = this.actual.insertFirst(item);
        this.expected.unshift({ position: newPosition, item });
        this.expect();
        return newPosition;
    }

    public insertLast(item: Serializable<T>): Position {
        const newPosition = this.actual.insertLast(item);
        this.expected.push({ position: newPosition, item });
        this.expect();
        return newPosition;
    }

    public moveFirst(position: Position) {
        this.actual.moveFirst(position);
        this.expected.unshift(...this.expected.splice(this.findIndexOf(position), /* deleteCount: */ 1));
        this.expect();
    }

    public moveLast(position: Position) {
        this.actual.moveLast(position);
        this.expected.push(...this.expected.splice(this.findIndexOf(position), /* deleteCount: */ 1));
        this.expect();
    }

    public moveBefore(successor: Position, position: Position) {
        this.actual.moveBefore(successor, position);
        const entry = this.expected.splice(this.findIndexOf(position), /* deleteCount: */ 1);
        this.expected.splice(this.findIndexOf(successor), /* deleteCount: */ 0, ...entry);
        this.expect();
    }

    public moveAfter(predecessor: Position, position: Position) {
        this.actual.moveAfter(predecessor, position);
        const entry = this.expected.splice(this.findIndexOf(position), /* deleteCount: */ 1);
        this.expected.splice(this.findIndexOf(predecessor) + 1, /* deleteCount: */ 0, ...entry);
        this.expect();
    }

    public remove(position: Position) {
        this.actual.remove(position);
        this.expected.splice(this.findIndexOf(position), /* deleteCount: */ 1);
        this.expect();
    }

    public get(position: Position): Serializable<T> {
        const actualItem = this.actual.get(position);
        assert.deepEqual(actualItem, this.expected[this.findIndexOf(position)].item);
        return actualItem;
    }

    public set(position: Position, value: Serializable<T>) {
        this.actual.set(position, value);
        this.expected[this.findIndexOf(position)].item = value;
        this.expect();
    }

    public clear() {
        this.actual.clear();
        this.expected.length = 0;
        this.expect();
    }
}

describeNoCompat("OrderedCollection", (getTestObjectProvider) => {
    let fixture: TestFixture<number>;
    let provider: ITestObjectProvider;

    beforeEach(async () => {
        provider = getTestObjectProvider();
        const container = await provider.createContainer(OrderedList.factory);
        fixture = new TestFixture<number>(await requestFluidObject<OrderedList<number>>(container, "default"));
    });

    afterEach(() => { fixture.expect(); });

    it("insertion", () => {
        const pos3 = fixture.insertLast(3);
        fixture.expect([3]);

        fixture.insertLast(5);
        fixture.expect([3, 5]);

        fixture.insertFirst(1);
        fixture.expect([1, 3, 5]);

        fixture.insertAfter(pos3, 4);
        fixture.expect([1, 3, 4, 5]);

        fixture.insertBefore(pos3, 2);
        fixture.expect([1, 2, 3, 4, 5]);
    });

    it("move", () => {
        const pos5 = fixture.insertLast(5);
        const pos4 = fixture.insertLast(4);
        const pos3 = fixture.insertLast(3);
        const pos2 = fixture.insertLast(2);
        const pos1 = fixture.insertLast(1);
        fixture.expect([5, 4, 3, 2, 1]);

        fixture.moveFirst(pos1);
        fixture.expect([1, 5, 4, 3, 2]);

        fixture.moveLast(pos5);
        fixture.expect([1, 4, 3, 2, 5]);

        fixture.moveBefore(pos3, pos2);
        fixture.expect([1, 4, 2, 3, 5]);

        fixture.moveAfter(pos3, pos4);
        fixture.expect([1, 2, 3, 4, 5]);
    });

    it("remove", () => {
        const pos1 = fixture.insertLast(1);
        const pos2 = fixture.insertLast(2);
        fixture.expect([1, 2]);

        fixture.remove(pos2);
        fixture.expect([1]);

        fixture.remove(pos1);
        fixture.expect([]);
    });

    it("clear", () => {
        fixture.insertLast(1);
        fixture.insertLast(2);
        fixture.expect([1, 2]);

        fixture.clear();
        fixture.expect([]);
    });
});
