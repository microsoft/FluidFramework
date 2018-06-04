# Sentry

[Sentry](https://sentry.io/) is a cross-platform crash reporting and aggregation platform. The stable/chart version does not populate environment variables correctly. Using a local modified chart. To install:


```console
$ helm install --name sentry . --wait --timeout 600
```
