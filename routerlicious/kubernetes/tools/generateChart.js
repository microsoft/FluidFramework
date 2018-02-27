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
  externalUrl: http://praguekube.westus2.cloudapp.azure.com
  host: alfred.wu2.prague.office-int.com
  cert: wu2-tls-certificate

deli:
  name: deli
  replicas: 1

scriptorium:
  name: scriptorium
  replicas: 1

routemaster:
  name: routemaster
  replicas: 1

tmz:
  name: tmz
  replicas: 1
  externalUrl: http://praguetmz.westus2.cloudapp.azure.com
  host: tmz.wu2.prague.office-int.com
  cert: wu2-tls-certificate

paparazzi:
  name: paparazzi
  replicas: 1

serviceGraph:
  name: servicegraph
  replicas: 1

riddler:
  name: riddler
  replicas: 1

historian:
  externalUrl: http://prague-historian.westus2.cloudapp.azure.com

zookeeper:
  local: false
  url: left-numbat-zookeeper:2181

mongodb:
  url: mongodb://honorary-chimp-mongodb:27017

redis:
  url: winsome-wombat-redis

kafka:
  topics:
    rawdeltas: rawdeltas
    deltas: deltas

ingress:
  class: nginx-prod
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
