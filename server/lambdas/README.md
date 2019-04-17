# Serverless Functions
We deploy serverless functions using [Nuclio](https://nuclio.io). Nuclio lets us deploy docker containers to kubernetes clusters and run them using triggers like RabbitMQ or Kafka.

## Tooling
* List Functions in region
    * docker run -it praguebuild.azurecr.io/kubedeploy  /bin/sh -c "cd ../bin; kubectl config use-context praguekubeeastus2; nuctl get function -n nuclio"
* Run Nuclio Dashboard
    * kubectl port-forward -n nuclio $(kubectl get pods -n nuclio -l nuclio.io/app=dashboard -o jsonpath='{.items[0].metadata.name}') 8070:8070
* Create a Load Balancer for your deployment
    * kubectl expose svc scribe --port 8080 --name=scribe-balancer --type=LoadBalancer -n nuclio
    * kubectl expose svc {name of svc running lambda} --port {port of svc} --name={name of loadbalancer} --type=LoadBalancer -n {namespace}


## How To Deploy


## How to Test
1. Unit Testing is the name of the game for serverless functions
2. Run the container via the commandline

## How to Log
1. Unclear

## Debugging Tips
* Unit Test
* Restart the connection to dashboard (if you're using it)
* Restart the pod in kube
