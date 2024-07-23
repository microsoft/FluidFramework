# Kubernetes deployment

## Prerequisites

These instructions assume that you're deploying to [Azure Kubernetes Service](https://azure.microsoft.com/en-us/services/kubernetes-service/)
with Kubernetes v1.23 or later, and using [Helm](https://helm.sh/) v3 or higher to deploy charts when necessary.

## Routerlicious deployment

Routerlicious is packaged into a [Helm](https://helm.sh) chart.
The chart defines the Kubernetes templates needed to deploy and run the various components of Routerlicious
as a single unit.

### Pre-requisites

Prior to deploying Routerlicious itself, a few other things need to be configured.

#### Redis, Mongo, Kafka, and Historian

You'll need to have Redis, MongoDB, and Historian (another Fluid service) running.

You can install MongoDB from the helm stable repository.
Below we deploy the chart provided by Bitnami and configure it to use the `managed-premium` storage class provided by AKS.
You can omit the optional key + value pairs to use the defaults defined in the Helm chart.
Make sure to replace the `<helm-release-name>` with a name to identify your release.

`helm install --set persistence.storageClass=managed-premium,persistence.size=4094Gi,usePassword=false,image.registry=<optional-registry>,image.repository=<optional-repo-name>,image.tag=<optional-tag> <helm-release-name> bitnami/mongodb`

Redis, Kafka, and Historian can be installed from the [`server/charts`](../../charts) directory.

Make note of the URLs to each of these; you'll have to provide them as values overrides when deploying the Routerlicious
chart.

#### Ingress controller

An Ingress controller needs to be deployed in the cluster.
We recommend the Helm chart for the Nginx-based [Ingress Controller](https://github.com/kubernetes/ingress-nginx) maintained
by the Kubernetes team.
Not to be confused with the [very similarly named Ingress Controller maintained by the Nginx team](https://docs.nginx.com/nginx-ingress-controller/).
Follow its instructions on how to deploy it to your cluster.

### Build and deploy the chart

The chart definition is in the [`server/routerlicious/kubernetes/routerlicious/`](./routerlicious/) folder.
To package the chart run the following command from the root of the repository:

```bash
helm package server/routerlicious/kubernetes/routerlicious
```

Then run this command to deploy it:

```bash
helm upgrade -i <your-release-name> <tgz-chart-file-output-by-previous-step>
```
