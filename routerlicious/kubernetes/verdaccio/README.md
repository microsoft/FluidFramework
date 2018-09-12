```
kubectl create secret generic verdaccio-auth --from-file=htpasswd
kubectl get secret verdaccio-auth -o yaml
```