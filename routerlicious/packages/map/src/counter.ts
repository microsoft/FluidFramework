import { IValueFactory, IValueOpEmitter, IValueOperation, IValueType } from "./interfaces";

export class CounterFactory implements IValueFactory<Counter> {
    public load(emitter: IValueOpEmitter, raw: number): Counter {
        return new Counter(emitter, raw || 0);
    }

    public store(value: Counter): number {
        return value.value;
    }
}

export class Counter {
    public get value(): number {
        return this._value;
    }

    // tslint:disable-next-line:variable-name
    constructor(private emitter: IValueOpEmitter, private _value: number) {
    }

    /**
     * Can be set to register an event listener for when the counter is incremented. The callback indicates the
     * amount the counter was incremented by.
     */
    public onIncrement = (value: number) => { return; };

    public increment(value: number, submit = true) {
        this._value = this._value + value;
        if (submit) {
            this.emitter.emit("increment", value);
        }

        this.onIncrement(value);

        return this;
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
                    prepare: async (value, params: number, local, op) => {
                        return;
                    },
                    process: (value, params: number, context, local, op) => {
                        // Local ops were applied when the message was created
                        if (local) {
                            return;
                        }

                        value.increment(params, false);
                    },
                },
            ]]);
    }
}
