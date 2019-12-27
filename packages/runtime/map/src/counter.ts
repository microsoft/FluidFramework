/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IValueFactory, IValueOpEmitter, IValueOperation, IValueType } from "./interfaces";

/**
 * Factory for the creation and loading of Counters.
 * @alpha
 */
export class CounterFactory implements IValueFactory<Counter> {
    /**
     * {@inheritDoc IValueFactory.load}
     */
    public load(emitter: IValueOpEmitter, raw: number = 0): Counter {
        return new Counter(emitter, raw);
    }

    /**
     * {@inheritDoc IValueFactory.store}
     */
    public store(value: Counter): number {
        return value.value;
    }
}

/**
 * Value type that can store a numerical value and modify it through increment/decrement.
 * @alpha
 */
export class Counter extends EventEmitter {
    /**
     * The numerical value stored by the Counter.
     * @alpha
     */
    public get value(): number {
        return this._value;
    }

    /**
     * Create a new Counter.
     * @param emitter - The emitter object to be used for op emission
     * @param _value - The initial value of the Counter
     * @alpha
     */
    constructor(private readonly emitter: IValueOpEmitter, private _value: number) {
        super();
    }

    public on(
        event: "incremented",
        listener: (incrementValue: number, currentValue: number) => void) {
        return super.on(event, listener);
    }

    /**
     * Increment the value stored by the Counter.  Negative values can be used to decrement the Counter.
     * @param value - The value to increment by
     * @param submit - True if an increment op should also be submitted to remote clients, false otherwise
     * @alpha
     */
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

/**
 * Value type defining a Counter.
 * @alpha
 */
export class CounterValueType implements IValueType<Counter> {
    /**
     * {@inheritDoc IValueType.name}
     */
    public static Name = "counter";

    /**
     * {@inheritDoc IValueType.name}
     */
    public get name(): string {
        return CounterValueType.Name;
    }

    /**
     * {@inheritDoc IValueType.factory}
     */
    public get factory(): IValueFactory<Counter> {
        return CounterValueType._factory;
    }

    /**
     * {@inheritDoc IValueType.ops}
     */
    public get ops(): Map<string, IValueOperation<Counter>> {
        return CounterValueType._ops;
    }

    /**
     * {@inheritDoc IValueType.factory}
     */
    private static readonly _factory: IValueFactory<Counter> = new CounterFactory();

    /**
     * {@inheritDoc IValueType.ops}
     */
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
