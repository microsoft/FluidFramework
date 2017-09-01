# Kubernetes deployment

## Cluster preparation
Azure Contaier Service is the simplest way to get a cluster up and running. Optionally instructions on how to manually
prepare a Kubernetes cluster on Azure can be found [here](azure.md).

You can also make use of minikube to run a local cluster for testing. The [minikube](minikube.md) page provides setup
instructions.

## Routerlicious deployment

Routerlicious is packaged into a [Helm](https://helm.sh) chart. The chart defines the Kubernetes templates needed
to deploy and run Routerlicoius as well as dependent services required by Routerlicious.

Once a base Kubernetes cluster is configured deploying Routerlicious is as simple as building and installing a
chart. Or in the future simpling installing a chart we have published to a chart repository.

### Base components

Prior to deploying the Routerlicious chart first a few base components need to be confgiured

To actually deploy our services you'll need to provide the cluster with credentials to our private container as
documented at https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/. This boils
down to the below command to create a secret in Kubernetes

```
kubectl create secret docker-registry regsecret --docker-server=prague.azurecr.io --docker-username=prague --docker-password=<password> --docker-email=kurtb@microsoft.com
```

For better performance we make use of SSDs to back our Kubernetes volumes. Run the following command to add in SSD
disk support (note you will need to create a a premium blob storage account with premium SSDs).

```
kubectl apply -f system/azure-premium-storage.yaml
```

And finally install helm into the cluster.

```
kubectl apply -f system/helm.yaml
helm init --service-account helm
```

### Build the chart

The chart definition is defined within routerlicious. To make generating this simpler for the CI system we
generate the Chart.yaml and values.yaml file via a script in the tools folder. This script outputs both of
these files. But with the ability to provide runtime parameters.

Once they are built we build dependencies (the helm version of npm install) followed by packaging the chart.

```
node tools/generateChart.js ./routerlicious/ $(Build.BuildId) $(Build.BuildId)
cd routerlicious
helm dependency build
helm package .
```

### Chart deployment

Simply take the tarball from the package step and deploy it to the cluster

```
helm upgrade -i pesky-platypus chart.tgz
```

### Optional Extras

Information on some optional extras you can also deploy to your cluster can be found at [extras](extras.md).