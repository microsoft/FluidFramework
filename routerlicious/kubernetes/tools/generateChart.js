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
  externalUrl: https://alfred.wu2.prague.office-int.com
  host: alfred.wu2.prague.office-int.com
  cert: wu2-tls-certificate
  tenants: []

deli:
  name: deli
  replicas: 8

scriptorium:
  name: scriptorium
  replicas: 8

routemaster:
  name: routemaster
  replicas: 8

tmz:
  name: tmz
  replicas: 8
  externalUrl: https://tmz.wu2.prague.office-int.com
  host: tmz.wu2.prague.office-int.com
  cert: wu2-tls-certificate

rotograph:
  name: rotograph
  replicas: 1

paparazzi:
  name: paparazzi
  replicas: 8

serviceGraph:
  name: servicegraph
  replicas: 1

riddler:
  name: riddler
  replicas: 2

historian:
  externalUrl: https://historian.wu2.prague.office-int.com

gitrest:
  url: http://smelly-wolf-gitrest

cobalt:
  url: http://smelly-wolf-cobalt

zookeeper:
  local: false
  url: left-numbat-zookeeper:2181

rabbitmq:
  connectionString: amqp://prague:JFqxYjRrIE@lumpy-worm-rabbitmq

mongodb:
  url: mongodb://quieting-guppy-mongodb:27017

redis:
  url: winsome-wombat-redis

kafka:
  topics:
    rawdeltas: rawdeltas
    deltas: deltas

minio:
  externalUrl: https://minio.wu2.prague.office-int.com
  endpoint: agents-storage-minio-svc

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
