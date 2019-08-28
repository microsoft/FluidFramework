# Sentry

[Sentry](https://sentry.io/) is a cross-platform crash reporting and aggregation platform. We use a custom yaml file to populate initial config variables. To install the chart:

```console
$ helm install --name sentry --wait -f values.yaml stable/sentry --timeout=600
```

Update the 'GITHUB_APP_ID' and 'GITHUB_API_SECRET' before deployment.