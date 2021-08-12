# tinylicious

Tinylicious is a minimal, self-contained, test implementation of the Fluid Framework service that is much smaller (tinier!) than Routerlicious, our reference implementation of the service.

## What is this for?

Tinylicious includes most of the basic features needed to **test** data stores and containers. While we use the [Webpack Fluid Loader](../../packages/tools/webpack-fluid-loader)'s in browser service for much of our data store and container development, Tinylicious offers some advantages because it's a standalone process. For instance, testing a Fluid Container from 2+ simultaneously connected clients can be easier using Tinylicious.

If you're looking for a reference implementation of the Fluid service, don't look here! Go check out [Routerlicious](../routerlicious).

## Getting Started
You can install, build, and start this service by running the following

```sh
npm i
npm run build
npm run start
```

## Configuration
### Port
Tinylicious uses port 7070 by default.  You can change the port number by setting an environment
variable named PORT to the desired number.  For example:
```sh
PORT=6502 npm run start
```

### Storage
The config.json file can be used to configure the Tinylicious service.

| Parameter        | Description                                                      | Default                          |
|:-----------------|:-----------------------------------------------------------------|:---------------------------------|
| `db.inMemory`    | Boolean indicating whether ops are stored in memory or to disk   | true                             |
| `db.path`        | If `db.inMemory` is false the folder on disk to store the ops    | "/var/tmp/db"                    |
| `storage`        | Storage path for snapshots                                       | "/var/tmp/tinylicious"           |

See config.json for more settings and their defaults.
