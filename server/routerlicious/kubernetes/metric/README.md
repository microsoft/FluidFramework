telegraf and influxdb are deployed using helm charts. Chart configs are mostly copied from [influxdata tick-charts](https://github.com/influxdata/tick-charts).

To install the charts. Run:
```bash
$ helm install --name data --namespace metric ./influxdb/
$ helm install --name polling --namespace metric ./telegraf/telegraf-service/
$ helm install --name hosts --namespace metric ./telegraf/telegraf-daemonset/
```
To deploy grafana. Run:

```bash
$ kubectl apply -f ./grafana/grafana-deployment.yaml
$ kubectl apply -f ./grafana/grafana-service.yaml
$ kubectl apply -f ./grafana/grafana-ingress.yaml
```

To access grafana dashboard, navigate to https://grafana.wu2.prague.office-int.com. Use username 'admin' and password 'XEUqUw!8YDgBH*4c'.

Dashboard configurations are kept up to date in the "dashboards" folder. In the event of grafana redeployment, use grafana's "import dashboard" option to restore the graphs.

For security purpose, we don't expose influxdb publicly. Use kubernetes port forwarding feature to run query directly against influxdb. Run:

```bash
$ kubectl get pods --namespace metric
```

This will list all the pods running telegraf, grafana, and influxdb. Copy the influxdb pod name. Then run:

```bash
$ kubectl port-forward --namespace metric <pod-name> 8086:8086
```

Below is an example of a sample query against influxdb.
```bash
curl -G 'http://localhost:8086/query?pretty=true' --data-urlencode "db=telegraf" --data-urlencode "q=SELECT * FROM \"latency\""
```