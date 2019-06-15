// Ink OT type
//

import * as actions from "./actions";
import { Delta, IDelta } from "./delta";
import * as operations from "./operations";
import { ISnapshot, Snapshot } from "./snapshot";

export const name = "ink";
export const uri = "http://microsoft.com/types/ink";

// Create a new document snapshot. Initial data can be passed in.
export function create(initial: ISnapshot): Snapshot {
    if (!initial || !initial.layers || !initial.layerIndex) {
        throw "Invalid initial data";
    }

    return new Snapshot(initial.layers, initial.layerIndex);
}

/**
 * Applies the delta to the provided snapshot
 */
export function apply(snapshot: Snapshot, delta: IDelta) {
    let newSnapshot = Snapshot.clone(snapshot);
    newSnapshot.apply(delta);
    return newSnapshot;
}

class OperationIterator {
    private index = 0;

    constructor(private delta: IDelta) {
    }

    /**
     * Resets the iterator back to the specified position
     */
    public reset(position: number) {
        this.index = position;
    }

    /**
     * Returns the index of the next element to be returned
     */
    public peekIndex(): number {
        return this.index;
    }

    /**
     * retrieves the next operation in the iterator and advances the cursor
     */
    public next() {
        let next = this.peek();
        this.index++;
        return next;
    }

    /**
     * Returns true if there is another element in the iterator
     */
    public hasNext(): boolean {
        return this.index < this.delta.operations.length;
    }

    /**
     * Retrieves the next operation in the iterator but does not advanced the cursor
     */
    public peek(): operations.IOperation {
        return this.delta.operations[this.index];
    }
}

// Transform delta by aplied. Returns transformed version of delta.
// Sym describes the symmetry of the operation. Its either 'left' or 'right'
// depending on whether the op being transformed comes from the client or the
// server.
export function transform(delta: IDelta, applied: IDelta, sym: string): IDelta {
    let result = new Delta();
    let deltaIterator = new OperationIterator(delta);
    let appliedIterator = new OperationIterator(applied);

    // Iterate through applied...
    //      Stylus down in applied adds +1 to layer (if client)
    //      Clears in applied resets layer offset to 0 (if client)
    //      keep track of index of last clear found (to clone any operations we need to preserve if delta clears)
    //
    let appliedLayerOffset = 0;
    let appliedLastClear = 0;
    while (appliedIterator.hasNext()) {
        let next = appliedIterator.next();
        let type = operations.getActionType(next);

        if ((type === actions.ActionType.StylusDown) && (sym === "left")) {
            appliedLayerOffset++;
        } else if (type === actions.ActionType.Clear) {
            // We can avoid checking sym for simplicity given this resets the offset to 0
            appliedLayerOffset = 0;
            appliedLastClear = appliedIterator.peekIndex();
        }
    }

    // Iterate through delta...
    //      Stylus down in applied adds +1 to layer (if client)
    //      Clears in applied resets layer offset to 0 (if client)
    //      Stylus down operations take the layer offset computed above
    //      Keep track of last clear encountered
    //
    let deltaLayerOffset = 0;
    let deltaLastClearTime = -1;
    while (deltaIterator.hasNext()) {
        let next = deltaIterator.next();
        let type = operations.getActionType(next);

        // Track information needed in the case of a clear - should I just store this in the delta since
        // it's easy to compute when building the structure?
        if (type === actions.ActionType.StylusDown) {
            // If the delta operation is the server then we want to offset client operations later
            if (sym === "right") {
                deltaLayerOffset++;
            }

            if (appliedLayerOffset === 0) {
                result.push(next);
            } else {
                result.stylusDown(
                    next.stylusDown.point,
                    next.stylusDown.pressure,
                    next.stylusDown.pen,
                    next.stylusDown.layer + appliedLayerOffset,
                    next.stylusDown.id,
                    next.time);
            }
        } else if (type === actions.ActionType.Clear) {
            // We can avoid checking sym for simplicity given this resets the offset to 0
            deltaLayerOffset = 0;
            deltaLastClearTime = next.time;
            result.push(next);
        } else if (type === actions.ActionType.StylusMove || type === actions.ActionType.StylusUp) {
            // We can append the operation as is
            result.push(next);
        } else {
            throw "Unknown type encountered";
        }
    }

    // On a clear in delta layer - copy over everything from last clear in applied layer - and set time to that of the
    // clear so that they 'pop' at the same time
    if (deltaLastClearTime !== -1) {
        // reset applied back to before the clear
        appliedIterator.reset(appliedLastClear);

        while (appliedIterator.hasNext()) {
            let next = appliedIterator.next();
            let type = operations.getActionType(next);

            if (type === actions.ActionType.StylusDown) {
                result.stylusDown(
                    next.stylusDown.point,
                    next.stylusDown.pressure,
                    next.stylusDown.pen,
                    next.stylusDown.layer + deltaLayerOffset,
                    next.stylusDown.id,
                    next.time);
            } else if (type === actions.ActionType.StylusMove || type === actions.ActionType.StylusUp) {
                // We can append the operation as is
                result.push(next);
            } else {
                throw "Unknown type encountered";
            }
        }
    }

    return result;
}

/**
 * Compose op1 and op2 to produce a new operation. The new operation must subsume the behaviour of op1 and op2.
 * Specifically, apply(snapshot, apply(op1), op2) == apply(snapshot, compose(op1, op2)). Note: transforming by
 * a composed operation is NOT guaranteed to produce the same result as transforming by each operation in order.
 * This function is optional, but unless you have a good reason to do otherwise, you should provide a compose function
 * for your type.
 */
export function compose(first: IDelta, second: IDelta): IDelta {
    let composedDelta = new Delta();
    composedDelta.compose(first);
    composedDelta.compose(second);

    return composedDelta;
}
