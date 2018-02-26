export interface ISet<T> {
    add(value: T): ISet<T>;

    delete(value: T): ISet<T>;

    entries(): T[];
}
