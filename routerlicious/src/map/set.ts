import { IValueFactory, IValueOpEmitter, IValueOperation, IValueType } from "../data-types";

export class DistributedSetFactory<T> implements IValueFactory<DistributedSet<T>> {
    public load(emitter: IValueOpEmitter, raw: any[]): DistributedSet<T> {
        return new DistributedSet<any>(emitter, raw || []);
    }

    public store(value: DistributedSet<T>): any[] {
        return value.entries();
    }
}

export class DistributedSet<T> {
    private internalSet: Set<T>;

    constructor(private emitter: IValueOpEmitter, value: T[]) {
        this.internalSet = new Set(value);
    }

    public add(value: T, submitEvent = true): DistributedSet<T> {
        this.internalSet.add(value);

        if (submitEvent) {
            this.emitter.emit("add", value);
        }

        return this;
    }

    public delete(value: T, submitEvent = true): DistributedSet<T> {
        this.internalSet.delete(value);

        if (submitEvent) {
            this.emitter.emit("delete", value);
        }

        return this;
    }

    public entries(): any[] {
        return Array.from(this.internalSet.values());
    }
}

export class DistributedSetValueType implements IValueType<DistributedSet<any>> {
    public static Name = "distributedSet";

    public get name(): string {
        return DistributedSetValueType.Name;
    }

    public get factory(): IValueFactory<DistributedSet<any>> {
        return this._factory;
    }

    public get ops(): Map<string, IValueOperation<DistributedSet<any>>> {
        return this._ops;
    }

    // tslint:disable:variable-name
    private _factory: IValueFactory<DistributedSet<any>>;
    private _ops: Map<string, IValueOperation<DistributedSet<any>>>;
    // tslint:enable:variable-name

    constructor() {
        this._factory = new DistributedSetFactory();
        this._ops = new Map<string, IValueOperation<DistributedSet<any>>>(
            [[
                "add",
                {
                    prepare: async (old, params) => {
                        return;
                    },
                    process: (old, params, context) => {
                        old.add(params, false);
                        return old;
                    },
                },
            ],
            [
                "delete",
                {
                    prepare: async (old, params) => {
                        return;
                    },
                    process: (old, params, context) => {
                        old.delete(params, false);
                        return old;
                    },
                },
            ]]);
    }
}
