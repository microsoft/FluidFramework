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
name: apps
version: 0.1.${patch}
description: A Helm chart for apps built on top of routerlicious.
home: https://github.com/microsoft/prague
`;

const values =
`## Generated from a tool - do not edit directly
## Prague image version
replicaCount: 1
image: prague.azurecr.io/apps:${imageVersion}

## Specify a imagePullPolicy
## ref: http://kubernetes.io/docs/user-guide/images/#pre-pulling-images
imagePullPolicy: IfNotPresent

name: apps

service:
  name: node
  type: NodePort
  externalPort: 80
  internalPort: 3000
  host: www.wu2.prague.office-int.com
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
  delta: https://alfred.wu2.prague.office-int.com
  storage: https://historian.wu2.prague.office-int.com
  resume: https://alfred.wu2.prague.office-int.com/intelligence/resume
  nativeTextAnalytics: http://praguepy.westus2.cloudapp.azure.com/
  spellchecker: https://augmentation.wu2.prague.office-int.com/spellchecker/api
  serverUrl: https://alfred.wu2.prague.office-int.com
  tmzUrl: https://tmz.wu2.prague.office-int.com
  blobStorageUrl: https://historian.wu2.prague.office-int.com
  scriptUrl: https://minio.wu2.prague.office-int.com/agents/

auth:
  redirectUrl: https://www.wu2.prague.office-int.com/auth/openid/return
  destroySessionUrl: https://login.microsoftonline.com/common/oauth2/logout?post_logout_redirect_uri=https://www.wu2.prague.office-int.com/
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
