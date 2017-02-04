import * as actions from "./actions";
import { IDelta } from "./delta";
import * as operations from "./operations";

export interface IInkLayer {
    // unique identifier for the ink layer
    id: string;

    // The operations to perform in the given layer
    operations: operations.IOperation[];
}

export interface ISnapshot {
    layers: IInkLayer[];
    layerIndex: { [key: string]: IInkLayer };
}

export class Snapshot implements ISnapshot {
    public static Clone(snapshot: Snapshot) {
        return new Snapshot(snapshot.layers, snapshot.layerIndex);
    }

    constructor(public layers: IInkLayer[] = [], public layerIndex: {[key: string]: IInkLayer } = {}) {
    }

    public apply(delta: IDelta) {
        let actionType = operations.getActionType(delta.operation);

        switch (actionType) {
            case actions.ActionType.Clear:
                this.processClearAction(delta.operation);
                break;
            case actions.ActionType.StylusUp:
                this.processStylusUpAction(delta.operation);
                break;
            case actions.ActionType.StylusDown:
                this.processStylusDownAction(delta.operation);
                break;
            case actions.ActionType.StylusMove:
                this.processStylusMoveAction(delta.operation);
                break;
            default:
                throw "Unknown action type";
        }
    }

    private processClearAction(operation: operations.IOperation) {
        this.layers = [];
        this.layerIndex = {};
    }

    private processStylusUpAction(operation: operations.IOperation) {
        // TODO - longer term on ink up - or possibly earlier - we can attempt to smooth the provided ink
        this.addOperationToLayer(operation.stylusUp.id, operation);
    }

    private processStylusDownAction(operation: operations.IOperation) {
        let layer = {
            id: operation.stylusDown.id,
            operations: [],
        };

        // Push if we are isnerting at the end - otherwise splice to insert at the specified location
        if (operation.stylusDown.layer === 0) {
            this.layers.push(layer);
        } else {
            this.layers.splice(this.layers.length - operation.stylusDown.layer, 0, layer);
        }

        // Create a reference to the specified layer
        this.layerIndex[layer.id] = layer;

        // And save the stylus down
        this.addOperationToLayer(operation.stylusDown.id, operation);
    }

    private processStylusMoveAction(operation: operations.IOperation) {
        this.addOperationToLayer(operation.stylusMove.id, operation);
    }

    private addOperationToLayer(id: string, operation: operations.IOperation) {
        let layer = this.layerIndex[id];
        layer.operations.push(operation);
    }
}
