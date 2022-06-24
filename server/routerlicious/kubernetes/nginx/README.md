# Deploying the NGINX ingress controller

## 1. Deploy an SSL certificate to the cluster

Get a cert from //ssladmin for the uri you want.
Turn your `.pfx` file into a `.pem` one, and that one into a pair of `.key` (private key) and `.crt` (public key) files.

```bash
openssl pkcs12 -in eu2_cert.pfx -out eu2-cert.pem -nodes
openssl rsa -in eu2-cert.pem -out tls.key
openssl x509 -in eu2-cert.pem -out tls.crt
```

If the .crt file does not include the full certificate chain, run the following command to generate intermediate certificates.

```bash
openssl crl2pkcs7 -nocrl -certfile eu2-cert.pem | openssl pkcs7 -print_certs -out tls.crt
```

Optionally, generate dhparams. Or, much quicker, just take already generated ones from another of our servers

```bash
openssl dhparam -out dhparam.pem 4096
```

Choose your desired kube cluster and install certificates and encryption form files.

```bash
kubectl create secret tls <name> --key tls.key --cert tls.crt
kubectl create secret generic <name> --from-file=dhparam.pem
```

## 2. Deploy serivce account, roles, and bindings for RBAC-enabled clusters

If your kube cluster uses rbac, deploy the roles and bindings from the `rbac` folder.

```bash
kubectl apply -f ./rbac
```

## 3. Deploy the ingress controller

Deploy the controller now. This assumes a rbac enabled cluster, so remove the <em>serviceAccountName: nginx-serviceaccount</em>
line from the deployment files if your cluster is not rbac enabled.
For security reasons, TLS 1.0 and 1.1 are disabled. Only TLS 1.2 is supported.

For example:

```bash
kubectl apply -f ./nginx-ingress-controller-ppe.yml
```

Check the service status:

```bash
kubectl get services -o wide | grep nginx
```
