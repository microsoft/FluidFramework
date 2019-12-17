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
apiVersion: v1
name: admin
version: 0.1.${patch}
description: A Helm chart for Fluid admin portal.
home: https://github.com/microsoft/FluidFramework
`;

const values =
`## Generated from a tool - do not edit directly
## Fluid image version
replicaCount: 1
image: prague.azurecr.io/admin:${imageVersion}

## Specify a imagePullPolicy
## ref: http://kubernetes.io/docs/user-guide/images/#pre-pulling-images
imagePullPolicy: IfNotPresent

name: admin

service:
  name: node
  type: NodePort
  externalPort: 80
  internalPort: 3000
  host: admin.wu2.prague.office-int.com
  sslCert: wu2-tls-certificate

resources:
  limits:
    cpu: 1024m
    memory: 1024Mi
  requests:
    cpu: 512m
    memory: 512Mi

ingress:
  class: nginx-prod

endpoints:
  mongodb: mongodb://quieting-guppy-mongodb:27017
  kafka: left-numbat-zookeeper:2181
  redis:
    url: winsome-wombat-redis
    port: 6379
    tls: false
  tenantsUrl: https://admin.wu2.prague.office-int.com
  historianUrl: https://historian.wu2.prague.office-int.com
  riddlerUrl: http://pesky-platypus-riddler
  gatewayUrl: http://pesky-platypus-gateway
  gitUrl: http://smelly-wolf-gitrest
  cobaltUrl: http://smelly-wolf-cobalt
  alfredUrl: https://alfred.wu2.prague.office-int.com
  jarvisUrl: https://jarvis.wu2.prague.office-int.com
  keyValueUrl: https://www.wu2.prague.office-int.com/loader/fluid/kv-cache-00018
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
