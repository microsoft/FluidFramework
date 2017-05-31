// Ink OT type
//

import * as actions from "./actions";
import { Delta, IDelta } from "./delta";
import * as operations from "./operations";
import { ISnapshot, Snapshot } from "./snapshot";

export const name = "ink-nocompose";
export const uri = "http://microsoft.com/types/ink-nocompose";

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
    let newSnapshot = Snapshot.Clone(snapshot);
    newSnapshot.apply(delta);
    return newSnapshot;
}

// Transform op1 by op2. Returns transformed version of op1.
// Sym describes the symmetry of the operation. Its either 'left' or 'right'
// depending on whether the op being transformed comes from the client or the
// server.
export function transform(delta: IDelta, applied: IDelta, sym: string): IDelta {
    let appliedType = operations.getActionType(applied.operations[0]);
    let deltaType = operations.getActionType(delta.operations[0]);

    if (appliedType === actions.ActionType.Clear || deltaType === actions.ActionType.Clear) {
        return new Delta().clear(delta.operations[0].time);
    }

    const operation = delta.operations[0];

    switch (deltaType) {
        // Move and up actions are local-only and so transfer as is
        case actions.ActionType.StylusMove:
        case actions.ActionType.StylusUp:
            return delta;
        case actions.ActionType.StylusDown:
            // In the case of two moves we need to adjust the insertion order given both
            // create a new layer. The tie breaking rule is that the server 'wins' and their
            // ink appears in the higher z-order.
            if ((appliedType === actions.ActionType.StylusDown) && (sym === "left")) {
                // We are transforming the client on the serer- need to adjust the insertion position
                return new Delta().stylusDown(
                    operation.stylusDown.point,
                    operation.stylusDown.pressure,
                    operation.stylusDown.pen,
                    operation.stylusDown.layer + 1,
                    operation.stylusDown.id,
                    operation.time);
            } else {
                return delta;
            }
        default:
            throw "Unknown action";
    }
}
