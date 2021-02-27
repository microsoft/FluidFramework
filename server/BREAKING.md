
## 0.1020 Breaking Changes

- [`RestWrapper` is now an abstract class](#`restwrapper`-is-now-an-abstract-class)
- [`Historian` no longer handles request headers](#`historian`-no-longer-handles-request-headers)

### `RestWrapper` is now an abstract class

`RestWrapper` is now an abstract class that cannot be instantiated. Use `BasicRestWrapper` instead to maintain current functionality.

### `Historian` no longer handles request headers

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

## 0.1019 and earlier Breaking Changes

Breaking changes in server packages and images were not tracked before 0.1020.
