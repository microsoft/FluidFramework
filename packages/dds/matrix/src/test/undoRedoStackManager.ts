/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: This is a temporary copy of the 'UndoRedoStackManager' from 'framework/undo-redo'
//       to unblock testing of SharedMatrix undo while we decide on the correct layering
//       for undo.

import { EventEmitter } from "@fluid-internal/client-utils";
import { IRevertible } from "../types.js";

enum UndoRedoMode {
	None,
	Redo,
	Undo,
}

/**
 * Helper class for creating a stack over an array
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
class UndoRedoStack extends Stack<Stack<IRevertible> | undefined> {
	public push(item: Stack<IRevertible> | undefined) {
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
 * Manages the Undo and Redo stacks, and operations within those stacks.
 * Allows adding items to the current operation on the stack, closing the current operation,
 * and issuing and undo or a redo.
 */
export class UndoRedoStackManager {
	private static revert(revertStack: UndoRedoStack, pushStack: UndoRedoStack) {
		// Close the pushStack, as it could get  new ops
		// from the revert, and we don't want those combined
		// with any existing operation
		pushStack.closeCurrentOperationIfInProgress();

		// Search the revert stack for the first defined operation stack
		while (!revertStack.empty() && revertStack.top() === undefined) {
			revertStack.pop();
		}

		// If there is a defined operation stack, revert it
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

		// Make sure both stacks have any open operations
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
		this.undoStack.itemPushedCallback = () => this.eventEmitter.emit("changePushed");
		this.redoStack.itemPushedCallback = () => this.eventEmitter.emit("changePushed");
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

	public undoOperation(): boolean {
		if (this.undoStack.empty()) {
			return false;
		}
		this.mode = UndoRedoMode.Undo;
		UndoRedoStackManager.revert(this.undoStack, this.redoStack);
		this.mode = UndoRedoMode.None;
		return true;
	}

	public redoOperation(): boolean {
		if (this.redoStack.empty()) {
			return false;
		}
		this.mode = UndoRedoMode.Redo;
		UndoRedoStackManager.revert(this.redoStack, this.undoStack);
		this.mode = UndoRedoMode.None;
		return true;
	}

	public pushToCurrentOperation(revertible: IRevertible) {
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
			currentStack.push(new Stack<IRevertible>(revertible));
		} else {
			operationStack.push(revertible);
		}
	}

	private clearRedoStack() {
		while (!this.redoStack.empty()) {
			const redoOpertionStack = this.redoStack.pop();
			if (redoOpertionStack !== undefined) {
				while (!redoOpertionStack.empty()) {
					const redoOperation = redoOpertionStack.pop();
					if (redoOperation !== undefined) {
						redoOperation.discard();
					}
				}
			}
		}
	}
}
