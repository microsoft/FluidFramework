import * as uuid from "node-uuid";
import * as actions from "./actions";
import * as core from "./core";
import { IOperation } from "./operations";
import * as tools from "./tools";

export interface IDelta {
    operation: IOperation;
}

/**
 * Fluent implementation of the IDelta interface to make creation the underlying operation easier.
 * Only one operation per delta is currently supported but it's expected this will expand to multiple in
 * the future
 */
export class Delta implements IDelta {
    constructor(public operation: IOperation = null) {
    }

    public clear(time: number = new Date().getTime()): Delta {
        this.throwIfExistingOperation();

        let clear: actions.IClearAction = { };

        this.operation = {
            clear,
            time,
        };

        return this;
    }

    public stylusUp(
        point: core.IPoint,
        pressure: number,
        id: string = uuid.v4(),
        time: number = new Date().getTime()): Delta {

        this.throwIfExistingOperation();

        let stylusUp: actions.IStylusUpAction = {
            id,
            point,
            pressure,
        };

        this.operation = {
            stylusUp,
            time,
        };

        return this;
    }

    public stylusDown(
        point: core.IPoint,
        pressure: number,
        pen: tools.IPen,
        layer: number = 0,
        id: string = uuid.v4(),
        time: number = new Date().getTime()): Delta {

        this.throwIfExistingOperation();

        let stylusDown: actions.IStylusDownAction = {
            id,
            layer,
            pen,
            point,
            pressure,
        };

        this.operation = {
            stylusDown,
            time,
        };

        return this;
    }

    public stylusMove(
        point: core.IPoint,
        pressure: number,
        id: string = uuid.v4(),
        time: number = new Date().getTime()): Delta {

        this.throwIfExistingOperation();

        let stylusMove: actions.IStylusMoveAction = {
            id,
            point,
            pressure,
        };

        this.operation = {
            stylusMove,
            time,
        };

        return this;
    }

    private throwIfExistingOperation() {
        if (this.operation) {
            throw "Operation aleady set";
        }
    }
}
