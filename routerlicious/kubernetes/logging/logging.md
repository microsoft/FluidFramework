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
