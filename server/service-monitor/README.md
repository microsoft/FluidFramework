# @fluid-internal/service-monitor

A Node.js client that tests liveness of Fluid ordering service. The script creates a new Fluid document and checks whether the client join message is sequenced and received.

Optionally, the script can also load a Node compatible component. The parameters for loading document and component are tunable using config.json file.

```
    "loader": {
        "orderer": <url_for_fluid_orderer>,
        "storage": <url_for_fluid_storage>,
        "tenant": <tenant_id>,
        "secret": <tenant_secret>,
        "jwtKey": <bearer_jwt_key>,
        "user": <user_name>,
        "waitMSec": <wait_time_for_connection>,
        "docId": <optional_doc_id>, // GUID is chosen if not provided
        "component": {
            "load": false,  // set to 'true' for loading components.
            "packageName": <component_package@version>,
            "installPath": "/tmp/components", // local path for installing component code
            "timeoutMS": <timeout_for_code_loading_to_finish>
        }
    }
```

Note that the component loader uses 'npm install' to load the package in 'installPath' directory. To install from a private registry, a '.npmrc' file is also required to be present in that directory.

# Monitoring in Kubernetes

For continuous service liveness monitoring, it is possible to deploy the script as a kubernetes cronjob. Instructions are listed below: 

To build and run/test locally using docker
```
npm run docker:build
npm run docker:start
```

Pushing to registry
```
docker build -t prague.azurecr.io/monitoring .
docker push prague.azurecr.io/monitoring
```

Deploying cron job
```
cd deployment
kubectl apply -f cronjob.yaml
```

To see cron job schedule and instances
```
kubectl get cronjobs
```

To see specific job instance.
```
kubectl get jobs --watch
```

To list the pods running this job
```
kubectl get pods --selector=job-name=<specific_job_name>
```

To view the output of a job pod instance
```
kubectl logs <pod_name>
```

To delete an existing job
```
kubectl delete cronjob service-monitoring
```

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
