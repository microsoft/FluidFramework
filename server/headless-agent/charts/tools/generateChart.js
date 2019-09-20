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
name: headless-agent
version: 0.1.${patch}
description: A Helm chart for Headless Chrome Deployment.
home: https://github.com/microsoft/FluidFramework
`;

const values =
`## Generated from a tool - do not edit directly
## Fluid image version
replicaCount: 4
image: prague.azurecr.io/headless-agent:${imageVersion}

## Specify a imagePullPolicy
## ref: http://kubernetes.io/docs/user-guide/images/#pre-pulling-images
imagePullPolicy: IfNotPresent

name: headless-agent

resources:
  limits:
    cpu: 2048m
    memory: 4096Mi
  requests:
    cpu: 512m
    memory: 512Mi

endpoints:
  kafka: left-numbat-zookeeper:2181
  alfred: http://pesky-platypus-alfred
  riddler: http://pesky-platypus-riddler
  alfredUrl: https://alfred.wu2.prague.office-int.com
  packageUrl: https://pragueauspkn-3873244262.azureedge.net
  historianUrl: https://historian.wu2.prague.office-int.com
  rabbitmq: ""
  redis: winsome-wombat-redis
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
