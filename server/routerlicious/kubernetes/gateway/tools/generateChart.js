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
name: gateway
version: 0.1.${patch}
description: A Helm chart for Fluid Gateway.
home: https://github.com/microsoft/FluidFramework
`;

const values =
`## Generated from a tool - do not edit directly
## Fluid image version
replicaCount: 1
image: prague.azurecr.io/prague:${imageVersion}

## Specify a imagePullPolicy
## ref: http://kubernetes.io/docs/user-guide/images/#pre-pulling-images
imagePullPolicy: IfNotPresent

name: gateway

alfred:
  externalUrl: https://alfred.wu2.prague.office-int.com
  tenants: []
  key: VBQyoGpEYrTn3XQPtXW3K8fFDd
  url: http://pesky-platypus-alfred

login:
  microsoft:
    clientId: ""
    secret: ""
  accounts:
    username: ""
    password: ""
  linkedAccounts: {}

gateway:
  externalUrl: https://www.wu2.prague.office-int.com
  host: www.wu2.prague.office-int.com
  cert: wu2-tls-certificate
  keyValueUrl: https://www.wu2.prague.office-int.com/loader/fluid/kv-cache-00018

packageManager:
  endpoint: https://packages.wu2.prague.office-int.com
  username: prague
  password: 8Fxttu_A

historian:
  externalUrl: https://historian.wu2.prague.office-int.com

mongodb:
  url: mongodb://quieting-guppy-mongodb:27017

redis:
  url: winsome-wombat-redis
  port: 6379
  tls: false

riddler:
  url: http://pesky-platypus-riddler

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
