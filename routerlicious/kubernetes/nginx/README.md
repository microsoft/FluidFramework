Choose your desired kube cluster and install certificates and encryption form files.

```bash
$ kubectl create secret tls <name> --key tls.key --cert tls.crt
$ kubectl create secret generic <name> --from-file=dhparam.pem
```

Create and expose a default backend.
```bash
$ kubectl create -f https://raw.githubusercontent.com/kubernetes/contrib/master/ingress/controllers/nginx/examples/default-backend.yaml
$ kubectl expose rc default-http-backend --port=80 --target-port=8080 --name=default-http-backend
```

Deploy a custom template file.
```bash
$ kubectl create configmap nginx-template --from-file=nginx.tmpl=./nginx.tmpl
```

Deploy the controller now.
```bash
$ kubectl create -f ./nginx-ingress-controller.yml
```

Check the service stat
```bash
$ kubectl get services -o wide | grep nginx
```
