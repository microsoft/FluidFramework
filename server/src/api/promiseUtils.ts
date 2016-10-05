import { Promise, Thenable } from 'es6-promise';

export class Deferred<T> {
    public promise: Promise<T>;

    private _resolve: (value?: T | Thenable<T>) => void;
    private _reject: (error?: any) => void;

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    resolve(value?: T | Thenable<T>) {
        this._resolve(value);
    }

    reject(error?: any) {
        this._reject(error);
    }
}