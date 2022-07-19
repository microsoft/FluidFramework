> **Note:** These breaking changes are only relevant to the server packages and images released from `./routerlicious`.

## 0.1037 Breaking Changes
- [IDeltaService added to alfred runnerFactory and resource](#IDeltaService-added-to-alfred-runnerFactory-and-resource)
#### `IDeltaService` added to alfred `runnerFactory` and `resource`
```ts
export class AlfredResources implements core.IResources {
    ...
    constructor(
        public config: Provider,
        public producer: core.IProducer,
        public redisConfig: any,
        public clientManager: core.IClientManager,
        public webSocketLibrary: string,
        public orderManager: core.IOrdererManager,
        public tenantManager: core.ITenantManager,
        public restThrottler: core.IThrottler,
        public socketConnectThrottler: core.IThrottler,
        public socketSubmitOpThrottler: core.IThrottler,
        public socketSubmitSignalThrottler: core.IThrottler,
        public singleUseTokenCache: core.ICache,
        public storage: core.IDocumentStorage,
        public appTenants: IAlfredTenant[],
        public mongoManager: core.MongoManager,
        public deltaService: core.IDeltaService,
        public port: any,
        public documentsCollectionName: string,
        public metricClientConfig: any,
        public documentsCollection: core.ICollection<core.IDocument>,
        public throttleAndUsageStorageManager?: core.IThrottleAndUsageStorageManager,
    ) 
    ....

export class AlfredResourcesFactory implements core.IResourcesFactory<AlfredResources> {
    public async create(config: Provider): Promise<AlfredResources> {
        ...
        return new AlfredResources(
            config,
            producer,
            redisConfig,
            clientManager,
            webSocketLibrary,
            orderManager,
            tenantManager,
            restThrottler,
            socketConnectThrottler,
            socketSubmitOpThrottler,
            socketSubmitSignalThrottler,
            redisJwtCache,
            storage,
            appTenants,
            operationsDbMongoManager,
            deltaService,
            port,
            documentsCollectionName,
            metricClientConfig,
            documentsCollection,
            throttleAndUsageStorageManager);
```

## 0.1032 Breaking Changes
- [deleteSummary added to IGitManager and IGitService](#deleteSummary-added-to-IGitManager-and-IGitService)
- [encoding type change](#encoding-type-change)

### @fluidframework/server-services-client@0.1032

#### `deleteSummary` added to `IGitManager` and `IGitService`

```ts
deleteSummary(softDelete: boolean): Promise<void>;
```

### @fluidframework/gitresources@0.1032

#### `encoding` type change

The `encoding` property of `ICreateBlobParams` has changed type from `string` to `"utf-8" | "base64"` to match the only supported values.

## 0.1023 Breaking Changes
- [@fluidframework/server-services-shared@0.1023](#@fluidframework/server-services-shared@0.1023)
  - [`shared.SocketIORedisConnection and shared.SocketIoServer` takes in an ioredis client instead of a node-redis client](#`shared.SocketIORedisConnection-and-shared.SocketIoServer`-using-ioredis)
- [@fluidframework/server-services@0.1023](#@fluidframework/server-services@0.1023)
  - [`services.RedisCache, services.ClientManager, services.RedisThrottleManager, and services.SocketIoRedisPublisher` uses ioredis client instead of a node-redis client](#`services.managers-and-services.publisher-using-ioredis)

### @fluidframework/server-services-shared@0.1023

#### `shared.SocketIORedisConnection and shared.SocketIoServer` using ioredis

```ts
import Redis from "ioredis";
import socketIo from "socket.io";
import { SocketIORedisConnection } from '@fluidframework/server-services'

const options: Redis.RedisOptions = {
        host: "host",
        port: "6379",
};
const pub = new Redis(options);
const sub = new Redis(options);

const pubConn =  new SocketIORedisConnection(pub);
const subConn =  new SocketIORedisConnection(sub);
const server = new SocketIoServer(new SocketIo(), pub, sub);
```

#### `services.RedisCache, services.ClientManager, services.RedisThrottleManager, and services.SocketIoRedisPublisher` using ioredis

```ts
import Redis from "ioredis";
import * as services from "@fluidframework/server-services";

const options: Redis.RedisOptions = {
        host: "host",
        port: "6379",
};
const redisClient = new Redis(options);

const redisCache = new services.RedisCache(redisClient);
const clientManager = new services.ClientManager(redisClient);
const redisClientForThrottling = new services.RedisThrottleStorageManager(redisClient);

const publisher = new services.SocketIoRedisPublisher(options);
```


## 0.1022 Breaking Changes

- [@fluidframework/server-services-client@0.1022](#@fluidframework/server-services-client@0.1022)
  - [`client.validateTokenClaims` no longer contains token expiration logic](#`client.validateTokenClaims`-no-longer-contains-token-expiration-logic)
  - [`client.validateTokenClaims` throws on invalid claims](#`client.validateTokenClaims`-throws-on-invalid-claims)
- [@fluidframework/server-services-utils@0.1022](#@fluidframework/server-services-utils@0.1022)
  - [`utils.validateTokenClaims` no longer contains token expiration logic](#`utils.validateTokenClaims`-no-longer-contains-token-expiration-logic)
  - [`utils.validateTokenClaims` throws on invalid claims](#`utils.validateTokenClaims`-throws-on-invalid-claims)

### @fluidframework/server-services-client@0.1022

#### `client.validateTokenClaims` no longer contains token expiration logic

Token expiration logic has been moved from `validateTokenClaims` to `validateTokenClaimsExpiration`. To maintain functionality, use the two in succession. For example,

```ts
import {
    validateTokenClaims,
    validateTokenClaimsExpiration,
} from "@fluidframework/server-services-client";

const claims = validateTokenClaims(token, tenantId, documentId);
if (isTokenExpiryEnabled) {
    validateTokenClaimsExpiration(claims, maxTokenLifetimeSec)
}
```

#### `client.validateTokenClaims` throws on invalid claims

`validateTokenClaims` previously returned `undefined` if claims were invalid. Now, instead, it will throw a NetworkError that contains a status code (i.e. 401 or 403).

### @fluidframework/server-services-utils@0.1022

#### `utils.validateTokenClaims` no longer contains token expiration logic

Token expiration logic has been moved from `validateTokenClaims` to @fluidframework/server-services-client's `validateTokenClaimsExpiration`. To maintain functionality, use the two in succession. For example,

```ts
import { validateTokenClaims } from "@fluidframework/server-services-utils";
import { validateTokenClaimsExpiration } from "@fluidframework/server-services-client";

const claims = validateTokenClaims(token, tenantId, documentId);
if (isTokenExpiryEnabled) {
    validateTokenClaimsExpiration(claims, maxTokenLifetimeSec)
}
```


#### `utils.validateTokenClaims` throws on invalid claims

`validateTokenClaims` previously returned `undefined` if claims were invalid. Now, instead, it will throw a NetworkError that contains a status code (i.e. 401 or 403).

## 0.1020 Breaking Changes

- [@fluidframework/server-services-client@0.1020](#@fluidframework/server-services-client@0.1020)
  - [`RestWrapper` is now an abstract class](#`restwrapper`-is-now-an-abstract-class)
  - [`Historian` class no longer handles request headers](#`historian`-class-no-longer-handles-request-headers)
- [@fluidframework/server-routerlicious-base@0.1020](#@fluidframework/server-routerlicious-base@0.1020)
  - [`Alfred` endpoints deltas/ and documents/ now validate token for every incoming request](#`alfred`-endpoints-deltas-and-documents-now-validate-token-for-every-incoming-request)

### @fluidframework/server-services-client@0.1020

#### `RestWrapper` is now an abstract class

`RestWrapper` is now an abstract class that cannot be instantiated. Use `BasicRestWrapper` instead to maintain current functionality.

#### `Historian` class no longer handles request headers

The `Historian` client class no longer builds its own request headers, and therefore does not have constructor parameters `getCredentials` and `getCorrelationId`. Instead, it relies on the consumer to pass in a `RestWrapper` with the desired default headers. To easily generate the necessary token format for communicating with the Historian service, use the new `getAuthorizationTokenFromCredentials()` function. For example,

```ts
import {
    BasicRestWrapper,
    Historian,
    getAuthorizationTokenFromCredentials,
    ICredentials
} from "@fluidframework/server-services-client";

const credentials: ICredentials = { user: "user", password: "password" };
const token = getAuthorizationTokenFromCredentials(credentials);
const restWrapper = new BasicRestWrapper(baseUrl, {}, undefined, { Authorization: token })
const Historian = new Historian(baseUrl, true, false, restWrapper);
```
#### `Alfred` endpoints deltas/ and documents/ now validate token for every incoming request

All the Alfred deltas/ and documents/ endpoints will now expect a valid JWT token as part of the authorization header. The token claims will be validated by Alfred and the token will be validated via Riddler api. The corresponding routerlicious driver changes are available with package @fluidframework/routerlicious-driver version >= 0.34.1.

## 0.1019 and earlier Breaking Changes

Breaking changes in server packages and images were not tracked before 0.1020.
