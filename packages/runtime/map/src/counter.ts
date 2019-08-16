/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IValueFactory, IValueOpEmitter, IValueOperation, IValueType } from "./interfaces";

export class CounterFactory implements IValueFactory<Counter> {
    public load(emitter: IValueOpEmitter, raw: number = 0): Counter {
        return new Counter(emitter, raw);
    }

    public store(value: Counter): number {
        return value.value;
    }
}

export class Counter extends EventEmitter {
    public get value(): number {
        return this._value;
    }

    constructor(private readonly emitter: IValueOpEmitter, private _value: number) {
        super();
    }

    // tslint:disable-next-line:no-unnecessary-override
    public on(
        event: "incremented",
        listener: (incrementValue: number, currentValue: number) => void) {
        return super.on(event, listener);
    }

    public increment(value: number, submit = true) {
        const previousValue = this._value;
        this._value = this._value + value;
        if (submit) {
            this.emitter.emit("increment", previousValue, value);
        }

        this.emit("incremented", value, this._value);
        return this;
    }
}

export class CounterValueType implements IValueType<Counter> {
    public static Name = "counter";

    public get name(): string {
        return CounterValueType.Name;
    }

    public get factory(): IValueFactory<Counter> {
        return CounterValueType._factory;
    }

    public get ops(): Map<string, IValueOperation<Counter>> {
        return CounterValueType._ops;
    }

    private static readonly _factory: IValueFactory<Counter> = new CounterFactory();
    private static readonly _ops: Map<string, IValueOperation<Counter>> = new Map<string, IValueOperation<Counter>>(
        [[
            "increment",
            {
                process: (value, params: number, local, op) => {
                    // Local ops were applied when the message was created
                    if (local) {
                        return;
                    }

                    value.increment(params, false);
                },
            },
        ]]);
}
