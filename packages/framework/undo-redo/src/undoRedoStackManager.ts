/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

export interface IRevertable {
    revert();
    disgard();
}

enum UndoRedoMode { None, Redo, Undo }

/**
 * Helper class for createing a stack over an array
 */
class Stack<T> {
    public itemPushedCallback: (() => void) | undefined;
    private readonly items: T[] = [];
    constructor(...items: T[]) {
        if (items !== undefined) {
            items.forEach((item) => this.push(item));
        }
    }

    public empty(): boolean {
        return this.items.length === 0;
    }
    public top(): T | undefined {
        if (!this.empty()) {
            return this.items[0];
        }
        return undefined;
    }
    public pop(): T | undefined {
        return this.items.shift();
    }

    public push(item: T) {
        this.items.unshift(item);
        if (this.itemPushedCallback !== undefined) {
            this.itemPushedCallback();
        }
    }
}

/**
 * Helper class for creating the Undo and Redo stacks
 */
class UndoRedoStack extends Stack<Stack<IRevertable> | undefined> {

    public push(item: Stack<IRevertable> | undefined) {
        if (item !== undefined) {
            item.itemPushedCallback = () => this.callItemPushedCallback;
        }
        super.push(item);
    }

    public closeCurrentOperationIfInProgress() {
        if (this.top() !== undefined) {
            this.push(undefined);
        } else {
            this.callItemPushedCallback();
        }
    }

    private callItemPushedCallback() {
        if (this.itemPushedCallback !== undefined) {
            this.itemPushedCallback();
        }
    }
}

/**
 * Manages the Undo and Redo stacks, and operations withing those stacks.
 * Allows adding items to the current operation on the stack, closing the current operation,
 * and issuing and undo or a redo.
 */
export class UndoRedoStackManager {
    private static revert(
        revertStack: UndoRedoStack,
        pushStack: UndoRedoStack,
    ) {
        // close the pushStack, as it could get  new ops
        // from the revert, and we don't want those combined
        // with any existing operation
        pushStack.closeCurrentOperationIfInProgress();

        // search the revert stack for the first defined operation stack
        while (!revertStack.empty() && revertStack.top() === undefined) {
            revertStack.pop();
        }

        // if there is a defined operation stack, revert it
        if (!revertStack.empty()) {
            const operationStack = revertStack.pop();
            if (operationStack !== undefined) {
                while (!operationStack.empty()) {
                    const operation = operationStack.pop();
                    if (operation !== undefined) {
                        operation.revert();
                    }
                }
            }
        }

        // make sure both stacks have any open operations
        // closed, since we won't want anything added to those
        //
        revertStack.closeCurrentOperationIfInProgress();
        pushStack.closeCurrentOperationIfInProgress();
    }

    private readonly undoStack = new UndoRedoStack();
    private readonly redoStack = new UndoRedoStack();
    private mode: UndoRedoMode = UndoRedoMode.None;
    private readonly eventEmitter = new EventEmitter();

    constructor() {
        this.undoStack.itemPushedCallback =
            () => this.eventEmitter.emit("changePushed");
        this.redoStack.itemPushedCallback =
            () => this.eventEmitter.emit("changePushed");
     }

    public closeCurrentOperation() {
        if (this.mode === UndoRedoMode.None) {
            this.undoStack.closeCurrentOperationIfInProgress();
        }
    }

    public on(event: "changePushed", listener: () => void) {
        this.eventEmitter.on(event, listener);
    }
    public removeListener(event: "changePushed", listener: () => void) {
        this.eventEmitter.removeListener(event, listener);
    }

    public undoOperation() {
        this.mode = UndoRedoMode.Undo;
        UndoRedoStackManager.revert(
            this.undoStack,
            this.redoStack);
        this.mode = UndoRedoMode.None;
    }

    public redoOperation() {
        this.mode = UndoRedoMode.Redo;
        UndoRedoStackManager.revert(
            this.redoStack,
            this.undoStack);
        this.mode = UndoRedoMode.None;
    }

    public pushToCurrentOperation(revertable: IRevertable) {
        let currentStack: UndoRedoStack;

        switch (this.mode) {
            case UndoRedoMode.None:
                currentStack = this.undoStack;
                this.clearRedoStack();
                break;

            case UndoRedoMode.Redo:
                currentStack = this.undoStack;
                break;

            case UndoRedoMode.Undo:
                currentStack = this.redoStack;
                break;

            default:
                throw new Error("unknown mode");
        }
        const operationStack = currentStack.top();
        if (operationStack === undefined) {
            currentStack.push(new Stack<IRevertable>(revertable));
        } else {
            operationStack.push(revertable);
        }
    }

    private clearRedoStack() {
        while (!this.redoStack.empty()) {
            const redoOpertionStack = this.redoStack.pop();
            if (redoOpertionStack !== undefined) {
                while (!redoOpertionStack.empty()) {
                    const redoOperation = redoOpertionStack.pop();
                    if (redoOperation !== undefined) {
                        redoOperation.disgard();
                    }
                }
            }
        }
    }
}
