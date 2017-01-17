declare namespace Base {

    interface Property<TKey, TData> {
        key: TKey;
        data: TData;
    }

    interface PropertyAction<TKey, TData> {
        <TAccum>(p: Property<TKey, TData>, accum: TAccum): boolean;
    }

    interface ConflictAction<TKey, TData> {
        (key: TKey, current: TData, proposed: TData): TData;
    }

    interface Dictionary<TKey, TData> {
        get(key: TKey): Property<TKey, TData>;
        put(key: TKey, data: TData, conflict?: ConflictAction<TKey, TData>);
        remove(key: TKey);
        map<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum);
        diag();
    }

    interface SortedDictionary<TKey, TData> extends Dictionary<TKey, TData> {
        max(): Property<TKey, TData>;
        min(): Property<TKey, TData>;
        mapRange<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum, start?: TKey, end?: TKey);
    }

    interface KeyComparer<TKey> {
        (a: TKey, b: TKey): number;
    }

}