---
"@fluidframework/presence": minor
"__section": other
---
Rename ValueManager related Presence APIs

API changes include:
```
export {
    LatestMap -> latestMapFactory,
    type LatestMapItemValueClientData -> LatestMapItemUpdatedClientData,
    type LatestMapValueClientData -> LatestMapClientData,
    type LatestMapValueManager -> LatestMap,
    type LatestMapValueManagerEvents -> LatestMapEvents,
    type ValueMap -> StateMap,
} from "./latestMapValueManager.js";

export {
    Latest -> latestStateFactory,
    type LatestValueManager -> Latest,
    type LatestValueManagerEvents -> LatestEvents,
} from "./latestValueManager.js";

export type {
    LatestValueClientData -> LatestClientData,
    LatestValueData -> LatestData,
    LatestValueMetadata -> LatestMetadata,
} from "./latestValueTypes.js";

export { StateFactory } from "./stateFactory.js";
```
