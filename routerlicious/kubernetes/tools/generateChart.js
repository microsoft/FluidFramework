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
home: https://github.com/microsoft/prague
`;

const values =
`## Generated from a tool - do not edit directly
## Prague image version
image: prague.azurecr.io/prague:${imageVersion}

## Specify a imagePullPolicy
## ref: http://kubernetes.io/docs/user-guide/images/#pre-pulling-images
imagePullPolicy: IfNotPresent

name: routerlicious

alfred:
  name: alfred
  replicas: 4

deli:
  name: deli
  replicas: 1

scriptorium:
  name: scriptorium
  replicas: 1

tmz:
  name: tmz
  replicas: 1
  externalUrl: http://praguetmz.westus2.cloudapp.azure.com

paparazzi:
  name: paparazzi
  replicas: 1

historian:
  name: historian
  externalUrl: http://prague-historian.westus2.cloudapp.azure.com
  image: prague.azurecr.io/historian:664

gitrest:
  name: gitrest
  image: prague.azurecr.io/gitrest:653
  persistence:
    storageClass: ssd
    size: 128Gi
    accessMode: ReadWriteOnce

gitssh:
  name: gitssh
  image: prague.azurecr.io/gitssh:654

zookeeper:
  local: false
  url: praguekafka-broker-1:2181

kafka:
  topics:
    rawdeltas: rawdeltas
    deltas: deltas

# Dependency overrides
minio:
  accessKey: prague
  secretKey: mhioAkNXTwdX4dXWgKgXVtHo
  serviceType: ClusterIP

mongodb:
  persistence:
    storageClass: ssd

rabbitmq:
  rabbitmqUsername: prague
  rabbitmqPassword: mhioAkNXTwdX4dXWgKgXVtHo
  persistence:
    storageClass: ssd

redis:
  usePassword: false
  persistence:
    enabled: false
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
