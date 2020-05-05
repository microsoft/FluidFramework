## Logging

## Monitoring

Install Prometheus from https://github.com/kubernetes/charts/pull/1295 given RBAC issues. Once the pull request gets taken
we can install prometheus directly from helm

Grafana to visualize. 

`helm install stable/grafana`

You can then view the Grafana dashboard by running

export POD_NAME=$(kubectl get pods --namespace default -l "app=wishful-rat-grafana,component=grafana" -o jsonpath="{.items[0].metadata.name}")
kubectl --namespace default port-forward $POD_NAME 3000
