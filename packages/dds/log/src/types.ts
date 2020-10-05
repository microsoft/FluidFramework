export type Tuple<T, L extends number, TObj = [T, ...T[]]> =
    Pick<TObj, Exclude<keyof TObj, "splice" | "push" | "pop" | "shift" |  "unshift">>
    & {
        readonly length: L
        [ I: number ]: T
        [Symbol.iterator]: () => IterableIterator<T>
    };

export const blockSize = 256 as const;

export interface ILogNode {
    a: number;
    i: undefined | string | Promise<string>;
}

export interface IInteriorNode<T = unknown> extends ILogNode {
    c?: LogNode<T>[];
}

export interface ILeafNode<T = unknown> extends ILogNode {
    c?: T[];
}

export type LogNode<T = unknown> = IInteriorNode<T> | ILeafNode<T>;
