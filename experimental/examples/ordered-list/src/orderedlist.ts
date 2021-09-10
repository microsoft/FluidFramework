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

export class OrderedList<T> extends DataObject implements Iterable<Serializable<T>> {
    public static get Name() { return "@fluid-experimental/ordered-set"; }

    public static readonly factory = new DataObjectFactory<OrderedList<unknown>, undefined, undefined, IEvent>(
        OrderedList.Name, OrderedList, [
            SharedTree.getFactory(),
        ], {},
    );

    private maybeTree?: SharedTree;

    protected async initializingFirstTime() {
        this.root.set("", SharedTree.create(this.runtime).handle);
    }

    protected async hasInitialized() {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.maybeTree = await this.root.get<IFluidHandle<SharedTree>>("")!.get();
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

    private insert(place: StablePlace, item: Serializable<T>): Position {
        const newNode = makePositionNode(item);
        this.tree.applyEdit(...Insert.create([newNode], place));
        return newNode.identifier;
    }

    public insertBefore(position: Position, item: Serializable<T>): Position {
        return this.insert(this.placeBefore(position), item);
    }

    public insertAfter(position: Position, item: Serializable<T>): Position {
        return this.insert(this.placeAfter(position), item);
    }

    public insertFirst(item: Serializable<T>): Position {
        return this.insert(this.firstPlace, item);
    }

    public insertLast(item: Serializable<T>): Position {
        return this.insert(this.lastPlace, item);
    }

    private move(destination: StablePlace, source: StableRange) {
        this.tree.applyEdit(...Move.create(source, destination));
    }

    public moveFirst(item: Position) {
        this.move(this.firstPlace, StableRange.only(item));
    }

    public moveLast(item: Position)  {
        this.move(this.lastPlace,  StableRange.only(item));
    }

    public moveBefore(successor: Position, position: Position) {
        this.move(this.placeBefore(successor), StableRange.only(position));
    }

    public moveAfter(predecessor: Position, position: Position) {
        this.move(this.placeAfter(predecessor), StableRange.only(position));
    }

    public remove(position: Position) {
        this.tree.applyEdit(Delete.create(StableRange.only(position)));
    }

    public get(position: Position): Serializable<T> {
        return this.view.getSnapshotNode(position).payload as Serializable<T>;
    }

    public set(position: Position, value: Serializable<T>) {
        this.view.setNodeValue(position, value);
    }

    public clear() {
        this.tree.applyEdit(
            Delete.create(
                StableRange.all({
                    parent: this.view.root,
                    label: itemsTrait,
                })));
    }

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

    [Symbol.iterator](): IterableIterator<Serializable<T>> {
        return this.toArray()[Symbol.iterator]();
    }
}

export const OrderedCollectionInstantiationFactory = OrderedList.factory;
