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