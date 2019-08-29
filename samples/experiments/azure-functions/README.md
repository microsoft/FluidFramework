# Azure Functions
## Azure Functions
### Azure Functions
Azure Functions

## Secrets
Secrets in the following areas will need to be provided to use this computer software program.

### /alfred-app-service
#### `config.json`
##### `mongo.endpoint`
Place the MongoDB endpoint in `mongo.endpoint`. It will look something like this: 

`mongodb://:@.documents.azure.com:10255/?ssl=true&replicaSet=globaldb`

##### `alfred.key`

Change the key here because the default value is not secure.

##### `redis.host`
Place the redis host url in `redist.host`. It looks like a url, eg:

`something.redis.cache.something.net`

##### `redis.key` & `redis.pass`
These are the same? 32 bytes of base64.

##### `eventHub.endpoint`
Place the eventHub endpoint here. Looks like this:

`Endpoint=sb://some.url.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=32ByteBase64Key`

##### `tenantConfig.key`
Place your tenant key here. Looks like 32 random alphanumeric characters.

#### `tenantConfig.storage.credentials`
Place your github username in `tenantConfig.storage.credentials.user` and your password in `tenantConfig.storage.credentials` to use github as a storage medium.

#### `runnerFactory.ts`
```typescript
            {
                password: "",
                user: "",
            });
```
Place your git password & username in lines 173 and 174, respectively.

### /chart
#### `alfred-configmap.yaml`
##### `mongo.endpoint`
Place the MongoDB endpoint in `mongo.endpoint`. It will look something like this: 

`mongodb://:@.documents.azure.com:10255/?ssl=true&replicaSet=globaldb`

##### `alfred.key`

Change the key here because the default value is not secure.

##### `redis.host`
Place the redis host url in `redist.host`. It looks like a url, eg:

`something.redis.cache.something.net`

##### `redis.key` & `redis.pass`
These are the same? 32 bytes of base64.

##### `eventHub.endpoint`
Place the eventHub endpoint here. Looks like this:

`Endpoint=sb://some.url.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=32ByteBase64Key`

##### `tenantConfig.key`
Place your tenant key here. Looks like 32 random alphanumeric characters.

#### `tenantConfig.storage.credentials`
Place your github username in `tenantConfig.storage.credentials.user` and your password in `tenantConfig.storage.credentials` to use github as a storage medium.

### `gateway-configmap.yaml`
#### `gateway.key`
Change the key here because the default value is not secure.

#### `gateway.tenants`
Place your tenant key here. Looks like 32 random alphanumeric characters.

#### `login.microsoft`
Place your microsoft clientId and secret here.

#### `login.accounts`
Place accounts here.

##### `redis.host`
Place the redis host url in `redist.host`. It looks like a url, eg:

`something.redis.cache.something.net`

##### `redis.key` & `redis.pass`
These are the same? 32 bytes of base64.

#### `error.endpoint`
Place error endpoint url here. Looks like this:

`https://:@something.com/2`

### `values.yaml`
#### `alfred.key`
Change the key here because the default value is not secure.

## /core-ordering
### `settings.ts`
#### `eventHub.endpoint`
```typescript
eventHub: {
        endpoint: "",
    },
```

Place the eventHub endpoint here. Looks like this:

`Endpoint=sb://some.url.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=32ByteBase64Key`

##### `mongo.endpoint`
```typescript
mongo: {
        collectionNames: {...},
        endpoint: "",
    },
```
Place the MongoDB endpoint here. It will look something like this: 

`mongodb://:@.documents.azure.com:10255/?ssl=true&replicaSet=globaldb`

##### `redis.host`
```typescript
redis: {
        host: "",
        key: "",
        port: 6380
    }
```
Place the redis host url and key here.


## /gateway-app-service
### `config.json`
##### `gateway.key`
Change the key here because the default value is not secure.

#### `gateway.tenants`
Place your tenant key here. Looks like 32 random alphanumeric characters.

##### `redis.host`
Place the redis host url in `redist.host`. It looks like a url, eg:

`something.redis.cache.something.net`

##### `redis.key` & `redis.pass`
These are the same? 32 bytes of base64.

### `controllers/errorTracking.ts`
#### `error.endpoint`
```typescript
const sentryDSN = "";
```
Place error endpoint url here. Looks like this:

`https://:@something.com/2`