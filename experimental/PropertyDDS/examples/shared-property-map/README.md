# Shared Property Map

Minimal [property tree](https://github.com/microsoft/FluidFramework/tree/main/experimental/PropertyDDS) instantiation with data binding and distributed change notifications. Intended to simplify the testing of [FluidFramework's](https://github.com/microsoft/FluidFramework) larger data use-cases.


## API

```ts
/*
 * Factory 
 */
export async function initMap(
    mapId: string | undefined,
    leafAdd: UpdateCallback,
    leafUpdate: UpdateCallback,
    leafRemove: DeleteCallback,
    treeClass: any = SharedPropertyTree,
    registerSchemaFlag: boolean = true
): Promise<SharedPropertyMap> 

/*
 * Map like interface
 */
export interface SharedPropertyMap {
    //basic functions
    delete(key: string): void;
    forEach(callbackfn: (value: string, key: string) => void): void;
    get(key: string): string | undefined;
    has(key: string): boolean;
    set(key: string, value: string): this;
    keys(): string[];
    // enhanced semantics, call fails if the key exists
    insert(key: string, value: string): this;
    // bulk variants for efficiency
    insertMany(map: Map<string, string>): this;
    updateMany(map: Map<string, string>): this;
    deleteMany(keys: string[]): void;
    // map identity token (needed for distributed editing)
    mapId(): string;
    // make changes visible to remote peers
    commit(): void;
    // container life-cycle
    dispose(): void;
}
```

## Install

```
npm install --save-dev @dstanesc/shared-property-map
```

## Usage

```ts
import { initMap } from '@dstanesc/shared-property-map';
const sharedMap = await initMap(
  mapId,
  updateLocalModel,
  updateLocalModel,
  deleteLocalModel
);
sharedMap.set("key1", "abc");
sharedMap.set("key2", "def");
sharedMap.commit();
```

## Demo

- React based [hello world](https://github.com/dstanesc/shared-property-map-hello)

## Configure Fluid Service

Configure the Fluid service w/ environment variables `FLUID_MODE=frs|router|tiny`

If `frs` is opted for, set-up both `SECRET_FLUID_TENANT` and  `SECRET_FLUID_TOKEN` env. vars. (as configured in your azure service  - `Tenant Id` respectively `Primary key` )

Example

```
FLUID_MODE=frs
SECRET_FLUID_TOKEN=xyz
SECRET_FLUID_TENANT=xyz
```

## Build & Test

> Note: npm tests are pre-configured with the `FLUID_MODE=tiny` setting (see `package.json`)

```sh
npx tinylicious
```
```sh
npm run clean
npm install --legacy-peer-deps
npm run build
npm run test
```


