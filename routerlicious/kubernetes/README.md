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

You'll also need to have a Redis, MongoDB, and Historian instances running.
`helm install -f system/mongodb.yaml stable/mongodb`
`helm install -f system/redis.yaml stable/redis`
Historian can be installed from the /charts/historian directory

Make note of the URLs to each of these and provide a values override for Routerlicious with them.

### Manual steps

We will move these to Kubernetes jobs. But for now they need to be applied manually the first time you create a cluster

```
ssh -i ~/.ssh/azure_kubernetes_rsa <admin>@<worker>.westus2.cloudapp.azure.com
./kafka-topics --zookeeper praguekafkawestus2-broker-1:2181 --partitions 8 --replication-factor 3 --create --topic rawdeltas
./kafka-topics --zookeeper praguekafkawestus2-broker-1:2181 --partitions 8 --replication-factor 3 --create --topic deltas
./kafka-topics --zookeeper praguekafkawestus2-broker-1:2181 --partitions 8 --replication-factor 3 --create --topic rawdeltas-ppe
./kafka-topics --zookeeper praguekafkawestus2-broker-1:2181 --partitions 8 --replication-factor 3 --create --topic deltas-ppe
curl -H "Content-Type: application/json" -X POST -d '{"name": "prague"}' --verbose prague-historian.westus2.cloudapp.azure.com/repos
```


http://praguekafka-w4viw5xf-worker-1.westus2.cloudapp.azure.com:9021/

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

### Legacy

Legacy steps to configure our cluster can be found at [legacy](legacy.md). Most of these steps are now taken
care of by Azure Container Service.

### Current Environments

PPE
Mongo - quoting-armadillo
Redis - lumpy-condor
Historian - terrific-otter

Prod
Mongo - honorary-chimp
Redis - winsome-wombat
Historian - smelly-wolf
