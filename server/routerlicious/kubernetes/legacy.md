If you're using ACS what follows will already be configured for you and isn't necessary.

For better performance we make use of SSDs to back our Kubernetes volumes. Run the following command to add in SSD
disk support (note you will need to create a a premium blob storage account with premium SSDs).

```
kubectl apply -f legacy/azure-premium-storage.yaml
```

And finally install helm into the cluster.

```
kubectl apply -f legacy/helm.yaml
helm init --service-account helm
```

### Manual steps

We will move these to Kubernetes jobs. But for now they need to be applied manually the first time you create a cluster

```
ssh -i ~/.ssh/azure_kubernetes_rsa <admin>@<worker>.westus2.cloudapp.azure.com
./kafka-topics --zookeeper praguek8skafka-broker-1:2181 --partitions 8 --replication-factor 3 --create --topic rawdeltas
./kafka-topics --zookeeper praguek8skafka-broker-1:2181 --partitions 8 --replication-factor 3 --create --topic deltas
./kafka-topics --zookeeper praguek8skafka-broker-1:2181 --partitions 8 --replication-factor 3 --create --topic rawdeltas-ppe
./kafka-topics --zookeeper praguek8skafka-broker-1:2181 --partitions 8 --replication-factor 3 --create --topic deltas-ppe
curl -H "Content-Type: application/json" -X POST -d '{"name": "prague"}' --verbose prague-historian.westus2.cloudapp.azure.com/repos
```


http://praguekafka-w4viw5xf-worker-1.westus2.cloudapp.azure.com:9021/

