/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import {
    ChangeNode,
    Definition,
    Delete,
    Insert,
    Move,
    NodeId,
    SharedTree,
    StablePlace,
    StableRange,
    TraitLabel,
} from "@fluid-experimental/tree";
import { v4 as uuid } from "uuid";
import { Serializable } from "@fluidframework/datastore-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";

const listItemDefinition = undefined as unknown as Definition;
const itemsTrait = "" as TraitLabel;

const makePositionNode = <T>(value: Serializable<T>): ChangeNode => ({
    identifier: uuid() as NodeId,
    definition: listItemDefinition,
    traits: {},
    payload: value,
});

export type Position = NodeId;

const treeKey = "" as const;

/**
 * Example DataObject demonstrating how to model an ordered list using the SharedTree DDS.
 */
export class OrderedList<T> extends DataObject {
    public static get Name() { return "@fluid-experimental/ordered-set"; }

    public static readonly factory = new DataObjectFactory<OrderedList<unknown>, undefined, undefined, IEvent>(
        OrderedList.Name, OrderedList, [
            SharedTree.getFactory(),
        ], {},
    );

    private maybeTree?: SharedTree;

    protected async initializingFirstTime() {
        this.root.set(treeKey, SharedTree.create(this.runtime).handle);
    }

    protected async hasInitialized() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.maybeTree = await this.root.get<IFluidHandle<SharedTree>>(treeKey)!.get();
    }

    private get tree() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.maybeTree!;
    }

    private get view() { return this.tree.currentView; }

    private get firstPlace() { return StablePlace.atStartOf({ parent: this.view.root, label: itemsTrait }); }

    private get lastPlace()  { return StablePlace.atEndOf({ parent: this.view.root, label: itemsTrait }); }

    private placeBefore(position: Position) {
        return StablePlace.before(this.view.getSnapshotNode(position).identifier);
    }

    private placeAfter(position: Position) {
        return StablePlace.after(this.view.getSnapshotNode(position).identifier);
    }

    private move(destination: StablePlace, source: StableRange) {
        this.tree.applyEdit(...Move.create(source, destination));
    }

    private insert(place: StablePlace, item: Serializable<T>): Position {
        const newNode = makePositionNode(item);
        this.tree.applyEdit(...Insert.create([newNode], place));
        return newNode.identifier;
    }

    /** Inserts the given `item` at the beginning of the list. */
    public insertFirst(item: Serializable<T>): Position {
        return this.insert(this.firstPlace, item);
    }

    /** Inserts the given `item` at the end of the list. */
    public insertLast(item: Serializable<T>): Position {
        return this.insert(this.lastPlace, item);
    }

    /** Inserts the given `item` before the item at `nextSibling`. */
    public insertBefore(nextSibling: Position, item: Serializable<T>): Position {
        return this.insert(this.placeBefore(nextSibling), item);
    }

    /** Inserts the given `item` after the item at `prevSibling`. */
    public insertAfter(prevSibling: Position, item: Serializable<T>): Position {
        return this.insert(this.placeAfter(prevSibling), item);
    }

    /** Moves the item at `position` to the beginning of the list. */
    public moveFirst(position: Position) {
        this.move(this.firstPlace, StableRange.only(position));
    }

    /** Moves the item at `position` to the end of the list. */
    public moveLast(position: Position)  {
        this.move(this.lastPlace,  StableRange.only(position));
    }

    /** Moves the item at `position` before the item at `nextSibling`. */
    public moveBefore(nextSibling: Position, position: Position) {
        this.move(this.placeBefore(nextSibling), StableRange.only(position));
    }

    /** Moves the item at `position` after the item at `prevSibling`. */
    public moveAfter(prevSibling: Position, position: Position) {
        this.move(this.placeAfter(prevSibling), StableRange.only(position));
    }

    /** Removes the item at `position`. */
    public remove(position: Position) {
        this.tree.applyEdit(Delete.create(StableRange.only(position)));
    }

    /** Returns the item at `position`. */
    public get(position: Position): Serializable<T> {
        return this.view.getSnapshotNode(position).payload as Serializable<T>;
    }

    /** Sets the item at `position` to the given `value`. */
    public set(position: Position, value: Serializable<T>) {
        this.view.setNodeValue(position, value);
    }

    /** Removes all items from the list. */
    public clear() {
        this.tree.applyEdit(
            Delete.create(
                StableRange.all({
                    parent: this.view.root,
                    label: itemsTrait,
                })));
    }

    /** Returns an array containing the items in the list. */
    public toArray() {
        const view = this.view;
        return view.getTrait({
            parent: view.root,
            label: itemsTrait,
        }).map((nodeId) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return view.getSnapshotNode(nodeId)!.payload as Serializable<T>;
        });
    }
}

export const OrderedCollectionInstantiationFactory = OrderedList.factory;
