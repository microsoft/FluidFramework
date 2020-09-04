# @fluidframework/server-routerlicious

Fluid server package containing the reference implementation of Fluid ordering service.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.

## Exported Modules

Some modules are exported as reusable classes and interfaces. You can use these to customize small portions of either service without duplicating the whole service. 

| Source File (src/) | Exports (from `@fluidframework/server-routerlicious entry) |
|-|-|
| alfred/runnerFactory.ts | `OrdererManager`, `AlfredResources`, `AlfredResourcesFactory`, `AlfredRunnerFactory` |
| alfred/runner.ts | `AlfredRunner` |
| alfred/app.ts | `alfred.app` |
| alfred/routes/index.ts | `alfred.routes` |
| alfred/routes/api/index.ts | `alfred.api` |
| alfred/utils.ts | `alfred.utils` |
| riddler/runnerFactory.ts | `RiddlerResources`, `RiddlerResourcesFactory`, `RiddlerRunnerFactory` |
| riddler/runner.ts | `RiddlerRunner` |
| riddler/tenantManager.ts | `ITenantDocument`, `TenantManager` |
| riddler/app.ts | `riddler.app` |
| riddler/api.ts | `riddler.api` |

### Example

Customizing the RiddlerResourceFactory

```typescript
// riddler/www.ts
import * as path from "path";
import nconf from "nconf";
import { RiddlerRunnerFactory } from "@fluidframework/server-routerlicious";
import { RiddlerResourcesFactory } from "./resourceFactory";

const configFile = path.join(__dirname, "../../config/config.json");
const config = nconf.argv().env({ separator: "__", parseValues: true }).file(configFile).use("memory");

utils.runService(
    new RiddlerResourcesFactory(),
    new RiddlerRunnerFactory(),
    "riddler",
    config,
);
```
```typescript
// riddler/resourceFactory.ts
import { MongoManager } from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import * as utils from "@fluidframework/server-services-utils";
import { RiddlerResources } from "@fluidframework/server-routerlicious";

export class RiddlerResourcesFactory implements utils.IResourcesFactory<RiddlerResources> {
    public async create(config: Provider): Promise<RiddlerResources> {
        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new MongoManager(mongoFactory);
        const tenantsCollectionName = config.get("mongo:collectionNames:tenants");

        /**
         * ...
         * Some special, one-off implementation details
         * ...
         */

        const loggerFormat = config.get("logger:morganFormat");
        const port = utils.normalizePort(process.env.PORT || "5000");
        const serverUrl = config.get("worker:serverUrl");
        const defaultHistorianUrl = config.get("worker:blobStorageUrl");
        const defaultInternalHistorianUrl = config.get("worker:internalBlobStorageUrl") || defaultHistorianUrl;

        return new RiddlerResources(
            tenantsCollectionName,
            mongoManager,
            port,
            loggerFormat,
            serverUrl,
            defaultHistorianUrl,
            defaultInternalHistorianUrl);
    }
}
```

## Packaged Services

| Service | Entry File Path |
|-|-|
| Alfred | `@fluidframework/server-routerlicious/dist/alfred/www.js` |
| Copier | `@fluidframework/server-routerlicious/dist/copier/index.js` |
| Deli | `@fluidframework/server-routerlicious/dist/deli/index.js` |
| Event Hub Deli | `@fluidframework/server-routerlicious/dist/event-hub/deli/index.js` |
| Event Hub | `@fluidframework/server-routerlicious/dist/event-hub-service/index.js` |
| Foreman | `@fluidframework/server-routerlicious/dist/foreman/index.js` |
| Kafka | `@fluidframework/server-routerlicious/dist/kafka-service/index.js` |
| Riddler | `@fluidframework/server-routerlicious/dist/riddler/www.js` |
| Routemanager | `@fluidframework/server-routerlicious/dist/routemanager/index.js` |
| Scribe | `@fluidframework/server-routerlicious/dist/scribe/index.js` |
| Scriptorium | `@fluidframework/server-routerlicious/dist/scriptorium/index.js` |

All components of Routerlicious can be consumed from the distributed package to stand up parts (or all) of Routerlicious.

### Examples

Running Deli in your own docker environment with a customized `kafka-service` could look like:

```yaml
# docker-compose.yml
services:
    # ...
    deli:
        build:
            context: .
            target: runner
        command: node packages/routerlicious/dist/kafka-service/index.js deli /usr/src/server/node_modules/@fluidframework/server-routerlicious/dist/deli/index.js
        environment:
            - DEBUG=fluid:*
            - NODE_ENV=development
        restart: always
    # ...
```

Deploying a Kubernetes cluster with out-of-the-box Alfred, a custom `RiddlerResourceFactory`, and Deli with a custom `kafka-service`:
```yaml
# kubernetes/routerlicious/templates/alfred-deployment.yaml
# ...
spec:
  # ...
  template:
    # ...
    spec:
      containers:
      - name: {{ template "alfred.fullname" . }}
        image: "{{ .Values.image }}"
        imagePullPolicy: {{ default "" .Values.imagePullPolicy | quote }}
        command:
          - 'node'
          - 'node_modules/@fluidframework/server-routerlicious/dist/alfred/www.js'
        ports:
          - name: ui
            containerPort: 3000
# ...
```
```yaml
# kubernetes/routerlicious/templates/riddler-deployment.yaml
# ...
spec:
  # ...
  template:
    # ...
    spec:
      containers:
      - name: {{ template "riddler.fullname" . }}
        image: "{{ .Values.image }}"
        imagePullPolicy: {{ default "" .Values.imagePullPolicy | quote }}
        command:
          - 'node'
          - 'packages/routerlicious/dist/riddler/www.js'
        ports:
          - name: ui
            containerPort: 5000
# ...
```
```yaml
# kubernetes/routerlicious/templates/deli-deployment.yaml
# ...
spec:
  # ...
  template:
    # ...
    spec:
      containers:
      - name: {{ template "deli.fullname" . }}
        image: "{{ .Values.image }}"
        imagePullPolicy: {{ default "" .Values.imagePullPolicy | quote }}
        command:
          - 'node'
          - 'packages/routerlicious/dist/kafka-service/index.js'
          - 'deli'
          - '/usr/src/server/node_modules/@fluidframework/server-routerlicious/dist/deli/index.js'
# ...
```
