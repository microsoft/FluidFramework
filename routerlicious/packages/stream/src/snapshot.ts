import { ActionType, getActionType, IDelta, IInkLayer, IOperation } from "./interfaces";

export interface ISnapshot {
    layers: IInkLayer[];

    // Stores a mapping from the provided key to its index in layers. Since
    // ISnapshot is serialized we need to use an index.
    layerIndex: { [key: string]: number };
}

export class Snapshot implements ISnapshot {
    public static Clone(snapshot: ISnapshot) {
        return new Snapshot(snapshot.layers, snapshot.layerIndex);
    }

    constructor(public layers: IInkLayer[] = [], public layerIndex: {[key: string]: number } = {}) {
    }

    public apply(delta: IDelta) {
        for (const operation of delta.operations) {
            this.applyOperation(operation);
        }
    }

    public applyOperation(operation: IOperation) {
        const actionType = getActionType(operation);

        switch (actionType) {
            case ActionType.Clear:
                this.processClearAction(operation);
                break;
            case ActionType.StylusUp:
                this.processStylusUpAction(operation);
                break;
            case ActionType.StylusDown:
                this.processStylusDownAction(operation);
                break;
            case ActionType.StylusMove:
                this.processStylusMoveAction(operation);
                break;
            default:
                throw new Error("Unknown action type");
        }
    }

    private processClearAction(operation: IOperation) {
        this.layers = [];
        this.layerIndex = {};
    }

    private processStylusUpAction(operation: IOperation) {
        // TODO - longer term on ink up - or possibly earlier - we can attempt to smooth the provided ink
        this.addOperationToLayer(operation.stylusUp.id, operation);
    }

    private processStylusDownAction(operation: IOperation) {
        const layer = {
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
        let layerIndex = this.layers.length - 1 - operation.stylusDown.layer;
        this.layerIndex[layer.id] = layerIndex;

        // And move any after it down by one
        // tslint:disable-next-line:no-increment-decrement
        for (layerIndex = layerIndex + 1; layerIndex < this.layers.length; layerIndex++) {
            const layerId = this.layers[layerIndex].id;
            this.layerIndex[layerId] = this.layerIndex[layerId] + 1;
        }

        // And save the stylus down
        this.addOperationToLayer(operation.stylusDown.id, operation);
    }

    private processStylusMoveAction(operation: IOperation) {
        this.addOperationToLayer(operation.stylusMove.id, operation);
    }

    private addOperationToLayer(id: string, operation: IOperation) {
        // TODO: Why is this operation sometimes undefined?
        if (this.layerIndex[id] !== undefined) {
            const layerIndex = this.layerIndex[id];
            if (this.layers[layerIndex].operations === undefined) {
                this.layers[layerIndex].operations = [];
            }
            this.layers[layerIndex].operations.push(operation);
        }
    }
}
