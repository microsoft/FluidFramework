# Deploying the NGINX ingress controller

## Pre-requisites: deploy an SSL certificate to the cluster

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

Install certificates from files.

```bash
kubectl create secret tls <name> --key tls.key --cert tls.crt
```

The deployed certificates for the CI environments are (`<namespace>/<name>`):

- `default/wu2-ppe-tls-certificate`
- `default/wu2-tls-certificate`

## Deploy Helm chart for the ingress controller

**NOTE**: This will work for an rbac-enabled cluster. A non-rbac cluster will require non-trivial changes to these steps.

First, define variables that depend on the environment.

For the PPE environment:

```bash
K8S_NAMESPACE=ppe
HELM_RELEASE_NAME=ingress-controller-ppe
VALUES_FILE=values-ppe.yaml
```

For the PROD environment:

```bash
K8S_NAMESPACE=prod
HELM_RELEASE_NAME=ingress-controller-prod
VALUES_FILE=values-prod.yaml
```

Then define some common variables and deploy the Helm chart:

```bash
HELM_CHART_NAME=ingress-nginx
HELM_CHART_REPO=https://kubernetes.github.io/ingress-nginx
HELM_CHART_VERSION=4.1.4

helm upgrade --install $HELM_RELEASE_NAME $HELM_CHART_NAME --version $HELM_CHART_VERSION --repo $HELM_CHART_REPO -f $VALUES_FILE --namespace $K8S_NAMESPACE --create-namespace
```

The output will include a command that you can use to check the status of the `Service` object, something similar to this:

```bash
kubectl --namespace <namespace> get services -o wide -w <generated-service-name>
```

### Uninstalling a release

To uninstall a release, run the following:

```bash
helm uninstall <release-name> --namespace <namespace>
```

Note the `--namespace` parameter, which is required if the release was originall deployed to a namespace.

You can list existing releases and their namespaces like this:

```bash
helm ls --all-namespaces
```
