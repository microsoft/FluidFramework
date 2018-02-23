import { IValueFactory, IValueOpEmitter, IValueOperation, IValueType } from "../data-types";

export interface ISerializedCounter {
    max: number;
    min: number;
    value: number;
}

export class CounterFactory implements IValueFactory<Counter> {
    private static default = {
        max: Number.MAX_VALUE,
        min: Number.MIN_VALUE,
        value: 0,
    };

    public load(emitter: IValueOpEmitter, raw: ISerializedCounter): Counter {
        raw = raw || CounterFactory.default;
        return new Counter(
            emitter,
            raw.value || CounterFactory.default.value,
            raw.min || CounterFactory.default.min,
            raw.max || CounterFactory.default.max);
    }

    public store(value: Counter): ISerializedCounter {
        return {
            max: value.max,
            min: value.min,
            value: value.value,
        };
    }
}

export class Counter {
    public get value(): number {
        return this._value;
    }

    public get min(): number {
        return this._min;
    }

    public get max(): number {
        return this._max;
    }

    // tslint:disable:variable-name
    constructor(
        private emitter: IValueOpEmitter,
        private _value: number,
        private _min: number,
        private _max: number) {
    }
    // tslint:enable:variable-name

    public increment(value: number) {
        this.apply(value);
        this.emitter.emit("increment", value);

        return this;
    }

    public apply(value: number) {
        this._value = Math.max(Math.min(this.value + value, this.max), this.min);
    }
}

export class CounterValueType implements IValueType<Counter> {
    public static Name = "counter";

    public get name(): string {
        return CounterValueType.Name;
    }

    public get factory(): IValueFactory<Counter> {
        return this._factory;
    }

    public get ops(): Map<string, IValueOperation<Counter>> {
        return this._ops;
    }

    // tslint:disable:variable-name
    private _factory: IValueFactory<Counter>;
    private _ops: Map<string, IValueOperation<Counter>>;
    // tslint:enable:variable-name

    constructor() {
        this._factory = new CounterFactory();
        this._ops = new Map<string, IValueOperation<Counter>>(
            [[
                "increment",
                {
                    prepare: async (old, params) => {
                        return;
                    },
                    process: (old, params, context) => {
                        old.apply(params);
                        return old;
                    },
                },
            ]]);
    }
}
