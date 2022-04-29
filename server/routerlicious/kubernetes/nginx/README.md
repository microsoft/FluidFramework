Get a cert from //ssladmin for the uri you want.
Turn your pfx into a pem. Turn your cert into a .key (private key) and .crt (public key) file.

```bash
openssl pkcs12 -in eu2_cert.pfx -out eu2-cert.pem -nodes
openssl rsa -in eu2-cert.pem -out tls.key
openssl x509 -in eu2-cert.pem -out tls.crt
```

If the .crt file does not include full certificate chain, run the following command to generate intermediate certificates.
```bash
openssl crl2pkcs7 -nocrl -certfile eu2-cert.pem.pem | openssl pkcs7 -print_certs -out tls.crt
```

Optionally generate dhparams. Or, much quicker, just take already generated ones from another of our servers
```bash
openssl dhparam -out dhparam.pem 4096
```

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

If your kube cluster uses rbac, deploy the roles and bindings from the rbac folder. 

Deploy the controller now. This assumes a rbac enabled cluster, so remove <em>serviceAccountName: nginx-serviceaccount</em> line from the deployment files if your cluster is not rbac enabled.
For security reasons, TLS 1.0 and 1.1 are disabled. Only TLS 1.2 is supported.

```bash
$ kubectl create -f ./nginx-ingress-controller.yml
```

Check the service stat
```bash
$ kubectl get services -o wide | grep nginx
```
