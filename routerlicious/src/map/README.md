# Map Data Types

## Counters
You can create a counter on a map key. We support incrementing/decremnting counter up/down to an upper/lower limit.
### Create counter on a map kay
**Required parameter:**<br/>
*key*: map key name for the counter.<br/>
**Optional parameter(s):**<br/>
*value*: Initial value (default is 0)<br/>
*min*: Minimum allowed value for the counter (default is Number.MIN_SAFE_INTEGER)<br/>
*max*: Maximum allowed value for the counter (default is Number.MAX_SAFE_INTEGER)
```
createCounter(key: string, value?: number, min?: number, max?: number): Promise<ICounter>;
```
### Counter interface.
```
 export interface ICounter {
    increment(value: number): Promise<void>;
 }
```
Creating or incrementing/decremnting a counter emits "valueChanged" events on the map.

## Set
You can create a set on a map key. We support addition, removal, and enumeration of set elements.
### Create set on a map kay
**Required parameter:**<br/>
*key*: map key name for the set<br/>
**Optional parameters:**<br/>
*value*: Initial elements (default is [])<br/>
```
createSet<T>(key: string, value?: T[]): Promise<ISet<T>>;
```
### Set interface.
```
export interface ISet<T> {
    add(value: T): Promise<T[]>;
    delete(value: T): Promise<T[]>;
    entries(): Promise<T[]>;
 }
```
Adding/deleting elements from a set emits "setElementAdded"/"setElementRemoved" events on the map. The added/removed element is also returned along with the map key. Example:
```
map.on("setElementAdded", (changed) => {
    // changed.key is the key for the set.
    // changed.value is the added element.
});
```