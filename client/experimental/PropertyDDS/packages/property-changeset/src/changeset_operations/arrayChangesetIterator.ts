/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Iterator to iterate over array ChangeSets
 */

 import isNumber from "lodash/isNumber";
 import isString from "lodash/isString";

// @ts-ignore
import { constants } from "@fluid-experimental/property-common";

import { SerializedChangeSet } from "../changeset";
import { ArrayIteratorOperationTypes } from "./operationTypes";

const { MSG } = constants;

type genericArray = (number | string | (SerializedChangeSet & { typeid: string; }))[];
export type arrayInsertList = [number, string | genericArray];
export type arrayModifyList = [number, string | genericArray] | [number, string, string] | [number, genericArray, genericArray];
export type arrayRemoveList = [number, number | string | genericArray];

/**
 * Description of an array operation
 */
export interface OperationDescription {
    _absoluteBegin?: number;
    type?: ArrayIteratorOperationTypes;
    offset?: number;
}

/**
 * Description of an insert array operation
 */
export interface InsertOperation extends OperationDescription {
    type: ArrayIteratorOperationTypes.INSERT;
    removeInsertOperation?: arrayInsertList;
    operation?: arrayInsertList;
}

/**
 * Description of a remove array operation
 */
export interface RemoveOperation extends OperationDescription {
    type: ArrayIteratorOperationTypes.REMOVE;
    removeInsertOperation?: arrayRemoveList;
    operation?: arrayRemoveList;
}

/**
 * Description of a modify array operation
 */
export interface ModifyOperation extends OperationDescription {
    type: ArrayIteratorOperationTypes.MODIFY;
    removeInsertOperation?: arrayModifyList;
    operation: arrayModifyList;
}

/**
 * Description of a modify array operation
 */
 export interface NOPOperation extends Omit<OperationDescription, "removeInsertOperation" | "operation"> {
    type: ArrayIteratorOperationTypes.NOP;
    operation?: [];
}

export type NoneNOPOperation = RemoveOperation | InsertOperation | ModifyOperation;
export type GenericOperation = NoneNOPOperation | NOPOperation;

/**
 * Iterator class which iterates over an array ChangeSet. It will successively return the operations ordered by their
 * position within the array. Additionally, it will keep track of the modifications to the array indices caused
 * by the previous operations.
 *
 */
export class ArrayChangeSetIterator {
    static types = ArrayIteratorOperationTypes; // @TODO Not sure if this is still required if we export it separately.

    private readonly _changeSet: SerializedChangeSet;
    private _copiedModifies: string | any[];
    private readonly _currentIndices: { insert: number; remove: number; modify: number; };
    private _currentOffset: number;
    private _lastOperationIndex: number;
    private _lastOperationOffset: number;

    private _atEnd: boolean;
    private _op: GenericOperation;

    public get opDescription(): GenericOperation {
        return this._op;
    }

    public get currentOffset(): number {
        return this._currentOffset;
    }

    public get lastOperationIndex(): number {
        return this._lastOperationIndex;
    }

    public get lastOperationOffset(): number {
        return this._lastOperationOffset;
    }

    /**
     * @param in_changeSet - The ChangeSet to iterate over (this has to be an array ChangeSet
     */
    constructor(in_changeSet: SerializedChangeSet) {
        this._changeSet = in_changeSet;
        // if we need to chop overlapping modifies internally, so we have to copy them
        // we do this lazy and only if really needed
        this._copiedModifies = in_changeSet.modify;
        this._currentIndices = {
            insert: 0,
            remove: 0,
            modify: 0,
        };

        this._currentOffset = 0;
        this._lastOperationIndex = -1;
        this._lastOperationOffset = 0;
        this._atEnd = false;

        this._op = {
            type: ArrayIteratorOperationTypes.NOP,
            offset: 0,
            operation: undefined,
        };

        // go to the first element
        this.next();
    }

    /**
     * Returns the next operation in the ChangeSet
     * @returns true, if there are operations left
     */
    next(): boolean {
        // Find the smallest index in the operations lists
        let currentIndex = Infinity;
        let type: ArrayIteratorOperationTypes;
        (this._op as any).removeInsertOperation = undefined;
        // Process the current remove entry
        if (this._changeSet.remove &&
            this._currentIndices.remove < this._changeSet.remove.length) {
            type = ArrayChangeSetIterator.types.REMOVE;
            currentIndex = this._changeSet.remove[this._currentIndices.remove][0];
            let currentLength = this._changeSet.remove[this._currentIndices.remove][1];
            if (!isNumber(currentLength)) {
                currentLength = currentLength.length;
            }

            // Check, whether this is a removeInsertOperation
            if (this._changeSet.insert &&
                this._currentIndices.insert < this._changeSet.insert.length &&
                this._changeSet.insert[this._currentIndices.insert][0] <= currentIndex + currentLength) {
                    (this._op as InsertOperation).removeInsertOperation = this._changeSet.insert[this._currentIndices.insert];
            }
        }

        // Process the current insert entry (we prefer remove over insert, since this prevents the array from growing more
        // than necessary)
        if (this._changeSet.insert &&
            this._currentIndices.insert < this._changeSet.insert.length &&
            this._changeSet.insert[this._currentIndices.insert][0] < currentIndex) {
            type = ArrayChangeSetIterator.types.INSERT;
            currentIndex = this._changeSet.insert[this._currentIndices.insert][0];
        }

        // Process the current modify entry
        if (this._copiedModifies &&
            this._currentIndices.modify < this._copiedModifies.length &&
            this._copiedModifies[this._currentIndices.modify][0] < currentIndex) {
            type = ArrayChangeSetIterator.types.MODIFY;
        }

        if (this._lastOperationIndex !== currentIndex) {
            this._currentOffset += this._lastOperationOffset;
            this._lastOperationIndex = currentIndex;
            this._lastOperationOffset = 0;
        }

        // We have found nothing, so we are at the end of the ChangeSet
        if (type === undefined) {
            this._op.type = ArrayChangeSetIterator.types.NOP;
            this._op.offset = this._currentOffset;
            this._op.operation = undefined;
            this._atEnd = true;
            return false;
        }

        // Determine the return value and update the internal indices and offsets depending on the next operation
        switch (type) {
            case ArrayChangeSetIterator.types.INSERT:
                this._op.type = ArrayChangeSetIterator.types.INSERT;
                // Define the return value
                this._op.operation = this._changeSet.insert[this._currentIndices.insert];
                this._op.offset = this._currentOffset;
                // Update the current offset. For an insert we have to increase it by the number of the inserted elements
                this._lastOperationOffset += (this._op.operation[1] as any).length;

                // Shift the internal index
                this._currentIndices.insert++;
                break;
            case ArrayChangeSetIterator.types.REMOVE:
                this._op.type = ArrayChangeSetIterator.types.REMOVE;
                // Define the return value
                this._op.operation = this._changeSet.remove[this._currentIndices.remove];
                this._op.offset = this._currentOffset;
                // Update the current offset. For a remove we have to decrement it by the number of the removed elements
                var removedElements = isNumber(this._op.operation[1]) ? this._op.operation[1] : this._op.operation[1].length;
                this._lastOperationOffset -= removedElements;

                // Shift the internal index
                this._currentIndices.remove++;
                break;
            case ArrayChangeSetIterator.types.MODIFY:
                {
                    this._op.type = ArrayChangeSetIterator.types.MODIFY;
                    this._op.offset = this._currentOffset;
                    // check, if the modify's range overlaps with coming insert changes:
                    let nextModify = this._copiedModifies[this._currentIndices.modify];
                    const modifyEnd = nextModify[0] + nextModify[1].length;
                    if (this._changeSet.insert &&
                        this._currentIndices.insert < this._changeSet.insert.length &&
                        this._changeSet.insert[this._currentIndices.insert][0] < modifyEnd) {
                        // we have an overlap and need to cut the modify
                        const insertPosition = this._changeSet.insert[this._currentIndices.insert][0];

                        // if we haven't copied the change set's modifies yet, we need to do that now
                        if (this._copiedModifies === this._changeSet.modify) {
                            this._copiedModifies = this._copyModifies(this._changeSet.modify);
                            // now we need to update nextModify!
                            nextModify = this._copiedModifies[this._currentIndices.modify];
                        }

                        // use modify only up to insert's position

                        // build a partial modify and cut the remaining one:
                        const partialModify: arrayModifyList = [nextModify[0], undefined];
                        if (isString(nextModify[1])) {
                            partialModify[1] = nextModify[1].substr(0, insertPosition - nextModify[0]);
                            nextModify[1] = nextModify[1].substr(insertPosition - nextModify[0]);
                        } else {
                            partialModify[1] = nextModify[1].splice(0, insertPosition - nextModify[0]);
                        }

                        nextModify[0] = insertPosition;

                        // use the whole modify
                        this._op.operation = partialModify;
                    } else {
                        // use the whole modify
                        this._op.operation = nextModify;

                        // Shift the internal index
                        this._currentIndices.modify++;
                    }
                    break;
                }
            default:
                throw new Error(`ArrayChangeSetIterator: ${MSG.UNKNOWN_OPERATION}`);
        }
        this._atEnd = false;
        return true;
    }

    /**
     * @returns true, if there are no more operations left
     */
    atEnd(): boolean {
        return this._atEnd;
    }

    private _copyModifies(in_modifies: string[]) {
        if (!in_modifies || in_modifies.length === 0) {
            return undefined;
        }
        const result = [];
        for (let i = 0; i < in_modifies.length; i++) {
            result.push([in_modifies[i][0], in_modifies[i][1].slice()]);
        }
        return result;
    }
}
