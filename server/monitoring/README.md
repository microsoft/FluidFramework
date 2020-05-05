# Monitoring Job
Monitors Fluid production health via a cron job.

To build locally
```
`npm run docker:build`
```

And to run locally
```
`npm run docker:start`
```

Building and pushing to Fluid registry
```
docker build -t prague.azurecr.io/monitoring .
docker push prague.azurecr.io/monitoring
```

Scheduling cron job
```
cd deployment
kubectl apply -f cronjob.yaml
```

To see cron job schedule and instances
```
kubectl get cronjobs
kubectl get jobs
```

To list the pods running this job
```
kubectl get pods --selector=app=service-monitoring
```

To view the output of a job pod instance
```
kubectl logs <pod_name>
```

To delete an existing job
```
kubectl delete cronjob service-monitoring
```

