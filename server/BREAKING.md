> **Note:** These breaking changes are only relevant to the server packages and images released from `./routerlicious`.

## 0.1020 Breaking Changes

- [@fluidframework/server-services-client](#@fluidframework/server-services-client)
  - [`RestWrapper` is now an abstract class](#`restwrapper`-is-now-an-abstract-class)
  - [`Historian` class no longer handles request headers](#`historian`-class-no-longer-handles-request-headers)
- [@fluidframework/server-routerlicious-base](#@fluidframework/server-routerlicious-base)
  - [`Alfred` endpoints deltas/ and documents/ now validate token for every incoming request](#`alfred`-endpoints-deltas-and-documents-now-validate-token-for-every-incoming-request)

### @fluidframework/server-services-client

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
