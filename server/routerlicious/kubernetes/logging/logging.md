# Logging

The logging services route log data via fluentd to an elasticsearch stateful set. They can be configured via the 
following commands

## Elasticsearch

`kubectl apply -f es-stateful-set.yml`
`kubectl apply -f es-service.yaml`

## Fluentd

`kubectl apply -f fluentd-config-map.yaml`
`kubectl apply -f fluentd-rbac.yaml`
`kubectl apply -f fluentd-daemonset.yaml`

## Clean-up Elasticsearch with Curator

We run a [CronJob](http://kubernetes.io/docs/user-guide/cron-jobs/) that will periodically run [Curator](https://github.com/elastic/curator) to clean up indices.

```shell
kubectl create -f es-curator-config.yaml
```
```shell
kubectl create -f es-curator.yaml
```

Please, confirm the cronjob has been created.

```shell
kubectl get cronjobs
NAME      SCHEDULE    SUSPEND   ACTIVE    LAST-SCHEDULE
curator   1 0 * * *   False     0         <none>
```

The job is configured to run once a day at _1 minute past midnight and delete indices that are older than 3 days_.

**Notes**

* The schedule can be changed by editing the cron notation in `es-curator.yaml`.
* The action can be changed (e.g. delete older than 3 days) by editing the `es-curator-config.yaml`.
* The definition of the `action_file.yaml` is quite self-explaining for simple set-ups. For more advanced configuration options, please consult the [Curator Documentation](https://www.elastic.co/guide/en/elasticsearch/client/curator/current/index.html).

To remove the curator job, just run:

```shell
kubectl delete cronjob elasticsearch-curator
kubectl delete configmap elasticsearch-curator-config
```