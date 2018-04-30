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
description: A Helm chart for Prague admin portal.
home: https://github.com/microsoft/prague
`;

const values =
`## Generated from a tool - do not edit directly
## Prague image version
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
  mongodb: mongodb://honorary-chimp-mongodb:27017
  tenantsUrl: https://admin.wu2.prague.office-int.com
  historianUrl: https://historian.wu2.prague.office-int.com
  riddlerUrl: http://pesky-platypus-riddler

auth:
  redirectUrl: https://admin.wu2.prague.office-int.com/auth/openid/return
  destroySessionUrl: https://login.microsoftonline.com/common/oauth2/logout?post_logout_redirect_uri=https://admin.wu2.prague.office-int.com/
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
