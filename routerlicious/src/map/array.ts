import { IValueFactory, IValueOpEmitter, IValueOperation, IValueType } from "../data-types";
import cloneDeep = require("lodash/cloneDeep");

interface IInsertAtParams<T> {
    index: number;
    value: T;
}

export class DistributedArrayFactory<T> implements IValueFactory<DistributedArray<T>> {
    public load(emitter: IValueOpEmitter, raw: any[]): DistributedArray<T> {
        return new DistributedArray<any>(emitter, raw || []);
    }

    public store(value: DistributedArray<T>): any[] {
        return value.value;
    }
}

export class DistributedArray<T> {
    // tslint:disable-next-line:variable-name
    private _value: T[];

    public get value(): T[] {
        return this._value;
    }

    constructor(private emitter: IValueOpEmitter, value: T[]) {
        this._value = cloneDeep(value);
    }

    /**
     * Can be set to register an event listener for when a new element is added to the array
     */
    public onInsertAt = (index: number, value: T) => { return; };

    /**
     * Inserts a new element into the array
     */
    public insertAt(index: number, value: T, submitEvent = true): DistributedArray<T> {
        this._value[index] = value;

        if (submitEvent) {
            const params: IInsertAtParams<T> = { index, value };
            this.emitter.emit("insertAt", params);
        }

        this.onInsertAt(index, value);

        return this;
    }
}

export class DistributedArrayValueType implements IValueType<DistributedArray<any>> {
    public static Name = "distributedArray";

    public get name(): string {
        return DistributedArrayValueType.Name;
    }

    public get factory(): IValueFactory<DistributedArray<any>> {
        return this._factory;
    }

    public get ops(): Map<string, IValueOperation<DistributedArray<any>>> {
        return this._ops;
    }

    // tslint:disable:variable-name
    private _factory: IValueFactory<DistributedArray<any>>;
    private _ops: Map<string, IValueOperation<DistributedArray<any>>>;
    // tslint:enable:variable-name

    constructor() {
        this._factory = new DistributedArrayFactory();
        this._ops = new Map<string, IValueOperation<DistributedArray<any>>>(
            [[
                "insertAt",
                {
                    prepare: async (old, params) => {
                        return;
                    },
                    process: (old, params: IInsertAtParams<any>, context) => {
                        old.insertAt(params.index, params.value, false);
                        return old;
                    },
                },
            ]]);
    }
}
