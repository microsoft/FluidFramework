
### Build Instructions
docker build . -t praguelambdas.azurecr.io/reverser:latest
docker push praguelambdas.azurecr.io/reverser:latest 
nuctl deploy reverser -n nuclio --run-image praguelambdas.azurecr.io/reverser:latest \
    --runtime nodejs \
    --handler handler:handler \
    --platform kube

### Test
// Get into the cluster... There should be a way to do this from an external IP
kubectl exec -it broken-molly-tmz-f4d98fd49-6n24v -- /bin/sh
// Curl the url
curl --data-ascii "racecar desrever" http://10.240.0.4:32753

You can get additional logs by adding -H "x-nuclio-log-level:debug" -v

You can get the url by looking at the kube endpoints that are available in the -n nuclio namespace
