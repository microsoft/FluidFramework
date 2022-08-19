# Kubernetes deployment

## Prerequisites

These instructions assume that you're deploying to [Azure Kubernetes Service](https://azure.microsoft.com/en-us/services/kubernetes-service/)
with Kubernetes v1.23, and using [Helm](https://helm.sh/) v3 or higher to deploy charts when necessary.

You can also make use of minikube to run a local cluster for testing. The [minikube](minikube.md) page provides setup
instructions.

## Routerlicious deployment

Routerlicious is packaged into a [Helm](https://helm.sh) chart. The chart defines the Kubernetes templates needed
to deploy and run Routerlicoius as well as some of the dependent services required by Routerlicious.

Once a base Kubernetes cluster is configured deploying Routerlicious is as simple as building and installing a
chart. Or in the future simpling installing a chart we have published to a chart repository.

### Base components

Prior to deploying the Routerlicious chart, a few base components need to be configured.

#### Access to the docker images

The Fluid Framework team's internal AKS cluster is configured so it can [authenticate to our ACR instance automatically](https://docs.microsoft.com/en-us/azure/aks/cluster-container-registry-integration?tabs=azure-cli),
no manual configuration is needed in that cluster.

For external clusters, you'll need to provide credentials to our private container registry as
documented [here](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/). This boils
down to the below command to create a secret in Kubernetes:

```bash
kubectl create secret docker-registry regsecret --docker-server=prague.azurecr.io --docker-username=prague --docker-password=/vM3i=D+K4+vj+pgha=cg=55OQLDWj3w --docker-email=kurtb@microsoft.com
```

#### Storage Classes

We use specific [StorageClasses](https://kubernetes.io/docs/concepts/storage/storage-classes/) for some services running in the cluster. For MongoDB we use a storage class
that leverages Azure's premium managed disks. This one comes by default with AKS clusters. For GitRest we use a storage class that leverages Azure's **unmanaged**
disks, and does not come by default in AKS. To create it, edit the `system/azure-unmanaged-premium.yaml`
file (adjust the `storageAccount` field, and if necessary, `skuName` and `location`) and then run this command:

```bash
kubectl apply -f system/azure-unmanaged-premium.yaml
```

#### Other base components

You'll also need to have a Redis, MongoDB, Rabbitmq, and Historian instances running.

We install MongoDB and Rabbitmq from the helm stable repository. We also configure MongoDB to use the managed-premium storage class in AKS.

In the following commands you can omit the optional key+value pairs to use the defaults defined in the Helm Chart. Also, replace the `<helm-release-name>` with the appropriate value.

`helm install --set persistence.storageClass=managed-premium,persistence.size=4094Gi,usePassword=false,image.registry=<optional-registry>,image.repository=<optional-repo-name>,image.tag=<optional-tag> <helm-release-name> bitnami/mongodb`
`helm install --set rbac.create=false,auth.username=prague,auth.password=[password],persistence.enabled=true,persistence.size=16Gi,image.registry=<optional-registry>,image.repository=<optional-repo-name>,image.tag=<optional-tag> <helm-release-name> bitnami/rabbitmq`

Redis, Kafka and Historian come from the `/server/charts` directory. You'll want to install each of them.

Make note of the URLs to each of these; you'll have to provide them as values overrides when deploying the Routerlicious
chart.

#### Ingress controller

Finally, an Ingress controller needs to be deployed in the cluster. We use the Helm chart for the Nginx-based
[Ingress Controller](https://github.com/kubernetes/ingress-nginx) maintained by the Kubernetes team. Not to be confused
with the [very similarly named Ingress Controller maintained by the Nginx team](https://docs.nginx.com/nginx-ingress-controller/).
Instructions on how to set it up for the FluidFramework team's internal test cluster can be found in the [nginx folder](./nginx/).

### Build the chart

The chart definition is defined within routerlicious. To make generating this simpler for the CI system we
generate the Chart.yaml and values.yaml file via a script in the tools folder. This script outputs both of
these files. But with the ability to provide runtime parameters.

Once they are built we build dependencies (the helm version of npm install) followed by packaging the chart.

```bash
node tools/generateChart.js ./routerlicious/ $(Build.BuildId) $(Build.BuildId)
cd routerlicious
helm dependency build
helm package .
```

### Chart deployment

Simply take the tarball from the package step and deploy it to the cluster

```bash
helm upgrade -i pesky-platypus chart.tgz
```

### Optional Extras

Information on some optional extras you can also deploy to your cluster can be found at [extras](extras.md).

### Legacy

Legacy steps to configure our cluster can be found at [legacy](legacy.md). Most of these steps are now taken
care of by Azure Kubernetes Service.

### Current Environments (outdated)

#### Shared

- Kafka - left-numbat

#### PPE

- Mongo - quoting-armadillo
- Redis - lumpy-condor
- Historian - terrific-otter
- Rabbitmq - modest-poodle

#### Prod

- Mongo - quieting-guppy
- Redis - winsome-wombat
- Historian - smelly-wolf
- Rabbitmq - lumpy-worm
