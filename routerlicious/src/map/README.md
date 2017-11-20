# Map Data Types

## Counter
You can create a counter on a map key. We support incrementing/decremnting counter to an upper/lower limit.
### Create counter on a map kay
**Required parameter:**<br/>
*key*: map key name for the counter.<br/>
**Optional parameter(s):**<br/>
*value*: Initial counter value (default is 0)<br/>
*min*: Minimum allowed value for the counter (default is Number.MIN_SAFE_INTEGER)<br/>
*max*: Maximum allowed value for the counter (default is Number.MAX_SAFE_INTEGER)
```
createCounter(key: string, value?: number, min?: number, max?: number: ICounter;
```
Creating a counter emits "initCounter" event on the map.
```
map.on("initCounter", (changed: api.IKeyValueChanged) => {
    // changed.key is the key for the counter.
    // changed.value is the created Counter.
    const counter = changed.value as types.ICounter;
    counter.increment(1);
});
```
### Counter interface.
```
 export interface ICounter {
    increment(value: number): Promise<void>;
    get(): Promise<number>;
 }
```
Incrementing/decremnting a counter emits "incrementCounter" events on the map.
```
map.on("incrementCounter", async (changed: IKeyValueChanged ) => {
    // changed.key is the key for the counter.
    // changed.value is the amount of increment/decrement.
});
```

## Set
You can create a set on a map key. We support addition, removal, and enumeration of set elements.
### Create set on a map kay
**Required parameter:**<br/>
*key*: map key name for the set<br/>
**Optional parameters:**<br/>
*value*: Initial set elements (default is [])<br/>
```
createSet<T>(key: string, value?: T[]): ISet<T>;
```
### Set interface.
```
export interface ISet<T> {
    add(value: T): ISet<T>;
    delete(value: T): ISet<T>;
    entries(): T[];
    getInternalSet(): Set<T>
 }
```
Creating set emits "setCreated" event on the map. The created set is also returned along with the map key. Example:
```
map.on("setCreated", (changed: api.IKeyValueChanged) => {
    // changed.key is the key for the set.
    // changed.value is the created set.
    const newSet = changed.value as types.ISet<number>;
    newSet.add(100);
});
```
Adding/deleting elements from a set emits "setElementAdded"/"setElementRemoved" events on the map. The added/removed element is also returned along with the map key. Example:
```
map.on("setElementAdded", (changed: api.IKeyValueChanged) => {
    // changed.key is the key for the set.
    // changed.value is the added element.
});
```