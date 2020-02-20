/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Simple helper script to generate a production compose file that includes a versioned docker image
const fs = require("fs");
const path = require("path");
const util = require("util");

if (process.argv.length < 4) {
    console.error("Invalid command line options");
    console.error("[outputDir] [imageVersion] [patch]");
    return 1;
}

const outputDir = process.argv[2];
const imageVersion = process.argv[3];
const patch = process.argv[4];

const chart =
` ## Generated from a tool - do not edit directly
name: routerlicious
version: 0.1.${patch}
description: Distributive object router
home: https://github.com/microsoft/FluidFramework
`;

const values =
`## Generated from a tool - do not edit directly
## Fluid image version
image: prague.azurecr.io/prague-server:${imageVersion}

## Specify a imagePullPolicy
## ref: http://kubernetes.io/docs/user-guide/images/#pre-pulling-images
imagePullPolicy: IfNotPresent

name: routerlicious

alfred:
  name: alfred
  replicas: 4
  externalUrl: https://alfred.wu2.prague.office-int.com
  host: alfred.wu2.prague.office-int.com
  cert: wu2-tls-certificate
  tenants: []
  key: VBQyoGpEYrTn3XQPtXW3K8fFDd

login:
  microsoft:
    clientId: ""
    secret: ""
  accounts:
    username: ""
    password: ""
  linkedAccounts: {}

gateway:
  name: gateway
  replicas: 4
  externalUrl: https://www.wu2.prague.office-int.com
  host: www.wu2.prague.office-int.com
  cert: wu2-tls-certificate
  keyValueUrl: https://www.wu2.prague.office-int.com/loader/fluid/kv-cache-00018

deli:
  name: deli
  replicas: 8

scriptorium:
  name: scriptorium
  replicas: 8

broadcaster:
  name: broadcaster
  replicas: 8

scribe:
  name: scribe
  replicas: 8

routemaster:
  name: routemaster
  replicas: 8

foreman:
  name: foreman
  replicas: 8
  externalUrl: https://tmz.wu2.prague.office-int.com
  host: tmz.wu2.prague.office-int.com
  cert: wu2-tls-certificate

paparazzi:
  name: paparazzi
  replicas: 8

serviceGraph:
  name: servicegraph
  replicas: 1

riddler:
  name: riddler
  replicas: 2
  tenants: []

packageManager:
  endpoint: https://packages.wu2.prague.office-int.com
  username: prague
  password: 8Fxttu_A

historian:
  externalUrl: https://historian.wu2.prague.office-int.com
  internalUrl: http://smelly-wolf-historian

gitrest:
  url: http://smelly-wolf-gitrest

cobalt:
  url: http://smelly-wolf-cobalt

zookeeper:
  local: false
  url: left-numbat-zookeeper:2181

rabbitmq:
  connectionString: ""

mongodb:
  url: mongodb://quieting-guppy-mongodb:27017

redis:
  url: winsome-wombat-redis
  port: 6379
  tls: false

redis2:
  url: dining-maltese-redis
  port: 6379
  tls: false

kafka:
  topics:
    rawdeltas: rawdeltas
    deltas: deltas
  url: left-numbat-kafka:9092

minio:
  externalUrl: https://minio.wu2.prague.office-int.com
  endpoint: agents-storage-minio-svc
  accessKey: ""
  secretKey: ""

ingress:
  class: nginx-prod

error:
  track: true
  endpoint: ""

worker:
  intelligence:
    textAnalytics:
      key: ""
    translation:
      key: ""
  clusterNpm: ""
  npm: ""
`;

const writeFileAsync = util.promisify(fs.writeFile);
const chartP = writeFileAsync(path.join(outputDir, "Chart.yaml"), chart);
const valuesP = writeFileAsync(path.join(outputDir, "values.yaml"), values);

Promise.all([chartP, valuesP]).then(
    () => {
        return 0;
    },
    (error) => {
        console.error(error);
        return 1;
    });
