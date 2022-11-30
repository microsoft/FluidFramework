# Kubernetes deployment

## Cluster preparation

Azure Container Service is the simplest way to get a cluster up and running. Optionally instructions on how to manually
prepare a Kubernetes cluster on Azure can be found [here](azure.md).

You can also make use of minikube to run a local cluster for testing. The [minikube](minikube.md) page provides setup
instructions.

**NOTE**: we currently support Kubernetes v1.23.

## Routerlicious deployment

Routerlicious is packaged into a [Helm](https://helm.sh) chart. The chart defines the Kubernetes templates needed
to deploy and run Routerlicoius as well as dependent services required by Routerlicious.

Once a base Kubernetes cluster is configured deploying Routerlicious is as simple as building and installing a
chart. Or in the future simpling installing a chart we have published to a chart repository.

### Base components

Prior to deploying the Routerlicious chart first a few base components need to be configured

To actually deploy our services you'll need to provide the cluster with credentials to our private container as
documented [here](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/). This boils
down to the below command to create a secret in Kubernetes

```bash
kubectl create secret docker-registry regsecret --docker-server=prague.azurecr.io --docker-username=prague --docker-password=/vM3i=D+K4+vj+pgha=cg=55OQLDWj3w --docker-email=kurtb@microsoft.com
```

```bash
kubectl apply -f system/azure-unmanaged-premium.yaml
```

You'll also need to have a Redis, MongoDB, Rabbitmq, and Historian instances running.

We install MongoDB and Rabbitmq from the helm stable repository
`helm install -f system/mongodb.yaml stable/mongodb`
`helm install --set rbacEnabled=false,rabbitmq.username=prague,rabbitmq.password=[rabbitmq password],persistence.enabled=true,persistence.size=16Gi stable/rabbitmq`

Redis, Kafka and Historian come from the /charts directory. You'll want to install each of them.

Make note of the URLs to each of these and provide a values override for Routerlicious with them.

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
care of by Azure Container Service.

### Current Environments

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
