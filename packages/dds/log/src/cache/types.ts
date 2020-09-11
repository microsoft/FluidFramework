export type Tuple<T, L extends number, TObj = [T, ...T[]]> =
    Pick<TObj, Exclude<keyof TObj, "splice" | "push" | "pop" | "shift" |  "unshift">>
    & {
        readonly length: L
        [ I: number ]: T
        [Symbol.iterator]: () => IterableIterator<T>
    };

export interface IInteriorNode<T> {
    i: string,
    c: Tuple<LogNode<T>, 256>;
}

export interface ILeafNode<T> {
    i: string;
    e?: Tuple<T, 256>;
}

export type LogNode<T> = IInteriorNode<T> | ILeafNode<T>;

export const isInteriorNode = <T>(candidate: LogNode<T>): candidate is IInteriorNode<T> =>"c" in candidate;
