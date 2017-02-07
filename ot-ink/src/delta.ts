import * as uuid from "node-uuid";
import * as actions from "./actions";
import * as core from "./core";
import { IOperation } from "./operations";
import * as tools from "./tools";

export interface IDelta {
    operations: IOperation[];
}

/**
 * Fluent implementation of the IDelta interface to make creation the underlying operation easier.
 * Only one operation per delta is currently supported but it's expected this will expand to multiple in
 * the future
 */
export class Delta implements IDelta {
    constructor(public operations: IOperation[] = []) {
    }

    /**
     * Composes two ink delta streams together - which is as simple as appending their operation
     * logs
     */
    public compose(delta: IDelta) {
        this.operations.concat(delta.operations);
    }

    public push(operation: IOperation) {
        this.operations.push(operation);
    }

    public clear(time: number = new Date().getTime()): Delta {
        let clear: actions.IClearAction = { };

        this.operations.push({ clear, time });

        return this;
    }

    public stylusUp(
        point: core.IPoint,
        pressure: number,
        id: string = uuid.v4(),
        time: number = new Date().getTime()): Delta {

        let stylusUp: actions.IStylusUpAction = {
            id,
            point,
            pressure,
        };

        this.operations.push({ stylusUp, time });

        return this;
    }

    public stylusDown(
        point: core.IPoint,
        pressure: number,
        pen: tools.IPen,
        layer: number = 0,
        id: string = uuid.v4(),
        time: number = new Date().getTime()): Delta {

        let stylusDown: actions.IStylusDownAction = {
            id,
            layer,
            pen,
            point,
            pressure,
        };

        this.operations.push({ stylusDown, time });

        return this;
    }

    public stylusMove(
        point: core.IPoint,
        pressure: number,
        id: string = uuid.v4(),
        time: number = new Date().getTime()): Delta {

        let stylusMove: actions.IStylusMoveAction = {
            id,
            point,
            pressure,
        };
        this.operations.push({ stylusMove, time });

        return this;
    }
}
