# Map
## Counters
You can create a counter on a map key. We support incrementing/decremnting counter for now.
### Create counter on a map.
Required parameter:<br/>
'key': map key name for the counter.<br/>
Optional parameters:<br/>
'value': Initial value (default is 0)<br/>
'min': Minimum allowed value for the counter (default is Number.MIN_SAFE_INTEGER)<br/>
'max': Maximum allowed value for the counter (default is Number.MAX_SAFE_INTEGER)
```
createCounter(key: string, value?: number, min?: number, max?: number): Promise<ICounter>;
```
### Counter interface.
```
 export interface ICounter {
    increment(value: number): Promise<void>;
 }
```
Creating or incrementing/decremnting a counter generates "valueChanged" events on the map.
