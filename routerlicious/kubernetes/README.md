# Kubernetes deployment

## Cluster preparation
Azure Contaier Service is the simplest way to get a cluster up and running.

Optionally instructions on how to manually prepare a Kubernetes cluster on Azure can be found [here](azure.md).

## Routerlicious deployment

### System

Helm service principal for Helm chart creation

`kubectl apply -f helm.yaml`

And add in SSD disk support (note you will need to create a a premium blob storage account with premium SSDs)

`kubectl apply -f system/azure-premium-storage.yaml`

### Dependent services

`kubectl apply -f compose/zookeeper.yaml`
`kubectl apply -f compose/kafka.yaml`

### Helm Charts

`helm init --service-account helm`

`helm install -f services/minio-helm-conf.yaml stable/minio`
`helm install -f services/redis-helm-conf.yaml stable/redis`
`helm install -f services/rabbitmq-helm-conf.yaml stable/rabbitmq`
`helm install -f services/mongodb-helm-conf.yaml stable/mongodb`

### Routerlicious services

You'll need to update the below with the services created by Helm above. A work item for us is to either package
this into a chart. Or standardize on the name of the services.

`kubectl apply -f deployment/prague-config-map.yaml`

To actually deploy our services you'll need to provide the cluster with credentials to our private container as
documented at https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/. This boils
down to the below command to create a secret in Kubernetes

`kubectl create secret docker-registry regsecret --docker-server=prague.azurecr.io --docker-username=prague --docker-password=<password> --docker-email=kurtb@microsoft.com`

And then how to deploy Routerlicious to that cluster [here](stack.md).

