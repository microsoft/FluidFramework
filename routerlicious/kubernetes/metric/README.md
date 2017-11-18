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
```

Dashboard configurations are kept up to date in the "dashboards" folder. In the event of redeployment, use grafana's "import dashboard" option to restore the graphs.

For security purpose, we don't expose grafana dashboard publicly. Use kubernetes port forwarding feature to load the dashboard in the browser. Run:

```bash
$ kubectl get pods --namespace metric
```

This will list all the pods running telegraf, grafana, and influxdb. Copy the pod name starts with 'grafana' prefix. Then run:

```bash
$ kubectl port-forward --namespace metric <grafana-pod-name> 5000:3000
```

This will map grafana exposed port (3000) to localhost 5000 port. Navigate to http://localhost:5000 to see the dashboard.