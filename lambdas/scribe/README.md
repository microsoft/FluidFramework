# Scribe on Lambdas

As we begin to saturate the abilities of one webclient, we still haven't come near the limits of the service. Running individual authors as lambdas will give us much larger stress test capabilities.

### Working with Nuclio

Nuclio forces us to use handler.js as the entry file. With our current implementation, we only get one file as well...

### TODO
1. Actually do scribe stuff
2. Add logging
3. Add coordination abilities of HTTP

### Test
// Get into the cluster... There should be a way to do this from an external IP
kubectl exec -it broken-molly-tmz-854945c997-txrmd -- /bin/sh
// Curl the internal url
curl --data-ascii "{docId}" http://10.240.0.4:32753

### Build Instructions
docker build . -t praguelambdas.azurecr.io/scribe:latest
docker push praguelambdas.azurecr.io/scribe:latest 
nuctl deploy scribe -n nuclio --run-image praguelambdas.azurecr.io/scribe:latest \
    --runtime nodejs \
    --handler handler:handler \
    --platform kube


### Input
{
  "DocumentId": "test-doc",
  "Text": "Hey, I wrote this text" 
}

curl --data '{"DocumentId": "test-sequence-1204-2", "Text": "Hey, I wrote this text"}' -H "x-nuclio-log-level:debug" -v  137.117.40.210:8080

