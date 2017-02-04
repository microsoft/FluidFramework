import * as actions from "./actions";
import { IDelta } from "./delta";
import * as operations from "./operations";

export interface IInkLayer {
    // unique identifier for the ink layer
    id: string;

    // The operations to perform in the given layer
    operations: operations.IOperation[];
}

export class Snapshot {
    public static Clone(snapshot: Snapshot) {
        return new Snapshot(snapshot.layers, snapshot.layerIndex);
    }

    constructor(private layers: IInkLayer[] = [], private layerIndex: {[key: string]: IInkLayer } = {}) {
    }

    public apply(delta: IDelta) {
        let actionType = operations.getActionType(delta.operation);

        switch (actionType) {
            case actions.Type.Clear:
                this.processClearAction(delta.operation);
            case actions.Type.StylusUp:
                this.processStylusUpAction(delta.operation);
            case actions.Type.StylusDown:
                this.processStylusDownAction(delta.operation);
            case actions.Type.StylusMove:
                this.processStylusMoveAction(delta.operation);
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
        this.addOperationToLayer(operation);
    }

    private processStylusDownAction(operation: operations.IOperation) {
        let layer = { 
            id: operation.stylusDown.id,
            operations: []
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
        this.addOperationToLayer(operation);
    }

    private processStylusMoveAction(operation: operations.IOperation) {
        this.addOperationToLayer(operation);
    }

    private addOperationToLayer(operation: operations.IOperation) {
        let layer = this.layerIndex[operation.stylusMove.id];
        layer.operations.push(operation);
    }
}
