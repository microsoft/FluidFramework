import * as actions from "./actions";

export interface IOperation {
    // Time, in milliseconds, that the operation occurred on the originating device
    time: number;

    // We follow the Delta pattern of using a key on an object to specify the action.
    // This is probably good regardless since it encapsulates the name of the action as
    // a string (the key) - which should help with backwards compatability. It also
    // allows us to statically type the action we set with the type. As opposed to storing
    // an enum with the action which could drift from the true type
    clear?: actions.IClearAction;
    stylusDown?: actions.IStylusDownAction;
    stylusUp?: actions.IStylusUpAction;
    stylusMove?: actions.IStylusMoveAction;
}

/**
 * Retrieves the type of action contained within the operation
 */
export function getActionType(operation: IOperation): actions.ActionType {
    if (operation.clear) {
        return actions.ActionType.Clear;
    } else if (operation.stylusDown) {
        return actions.ActionType.StylusDown;
    } else if (operation.stylusUp) {
        return actions.ActionType.StylusUp;
    } else if (operation.stylusMove) {
        return actions.ActionType.StylusMove;
    } else {
        throw "Unknown action";
    }
}

/**
 * Extracts the IStylusAction contained in the operation
 */
export function getStylusAction(operation: IOperation): actions.IStylusAction {
    if (operation.stylusDown) {
        return operation.stylusDown;
    } else if (operation.stylusUp) {
        return operation.stylusUp;
    } else if (operation.stylusMove) {
        return operation.stylusMove;
    } else {
        throw "Unknown action";
    }
}

/**
 * Helper function to retrieve the ID of the stylus operation
 */
export function getStylusId(operation: IOperation): string {
    let type = getActionType(operation);
    switch (type) {
        case actions.ActionType.StylusDown:
            return operation.stylusDown.id;
        case actions.ActionType.StylusUp:
            return operation.stylusUp.id;
        case actions.ActionType.StylusMove:
            return operation.stylusMove.id;
        default:
            throw "Non-stylus event";
    }
}
