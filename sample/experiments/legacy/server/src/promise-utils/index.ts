import { Promise, Thenable } from "es6-promise";

export class Deferred<T> {
    public promise: Promise<T>;

    private resolveFn: (value?: T | Thenable<T>) => void;
    private rejectFn: (error?: any) => void;

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolveFn = resolve;
            this.rejectFn = reject;
        });
    }

    public resolve(value?: T | Thenable<T>) {
        this.resolveFn(value);
    }

    public reject(error?: any) {
        this.rejectFn(error);
    }
}
