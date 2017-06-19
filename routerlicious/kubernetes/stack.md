## Logging

## Monitoring

Install Prometheus from https://github.com/kubernetes/charts/pull/1295 given RBAC issues. Once the pull request gets taken
we can install prometheus directly from helm

Grafana to visualize. 

`helm install stable/grafana`

You can then view the Grafana dashboard by running

export POD_NAME=$(kubectl get pods --namespace default -l "app=wishful-rat-grafana,component=grafana" -o jsonpath="{.items[0].metadata.name}")
kubectl --namespace default port-forward $POD_NAME 3000

## Helm

### Installation

Kubernetes has a role based access control system that requires a service account to be created so that Helm has access
to creating Kubernetes objects. You can set this up by running.

`kubectl apply -f system/helm.yaml`

And once applied you can initialize helm with the following line.

`helm init --service-account helm`

The access control system is a new addition to Kubernetes. Helm is working on automating the above to simplify the init
process.

### Services

We rely on the following helm packages to run our service

`helm install -f minio-helm-conf.yaml stable/minio`

`helm install -f redis-helm-conf.yaml stable/redis`

`helm install -f rabbitmq-helm-conf.yaml stable/rabbitmq`

... there seemed to be a slow down here ... but I'm also running a media stream and a huge download so there's a chance
it's just my network. Disabling storage seemed to avoid pauses in ink. Maybe unrelated. But at the same time we
don't need persistence anyone for our Redis cluster.

`helm install -n knobby-catfish -f mongodb-helm-conf.yaml stable/mongodb`

There were definitely pauses when enabling mongodb. Switching over to the premium disk storage got rid of it. The SSD
seems to be MUCH faster (as Azure tells us) for DB scenarios. We should use them when needed.

Kafka is in an incubation stage as a plugin and the performance is quite slow relative to the wurstmeister setup. So
for now we are not making use of it.

`helm install incubator/kafka`
