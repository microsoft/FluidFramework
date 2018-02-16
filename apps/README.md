Example of apps build on top of routerlicious api using 'prague' as a tenant.

# Routerlicious auth model
When a signed token is present in api.load call, routerlicious verifies the token using a common symmetric key (shared with tenants) and matches the provided tenant_id and secret_key with DB. It then grants the user access to the document. It uses [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken) library for verifying the token. So the app should use the same library and key to sign the token. Example of a token creation:

```javascript
    jwt.sign(
        {
            permission: "read:write",   // optional for now.
            secret: <secret_key>,     // required
            tenantid: <tenant_id>,    // required
            user: {
                    data: null,     // optinoal
                    id: email,      // required
            },
        },
        SYMMETRIC_SIGN_KEY);
```

# Passing auth token to routerlicious
Add a token field to api load call.

```javascript
await prague.api.load(id, { encrypted: false, token }).catch((err) => {
    return Promise.reject(err);
});
```
Passing an invalid token will fail the load call.

# Building and Running
The app can be built and run using of the the following two approaches.

## Docker
For local building and running, [Docker](https://www.docker.com/) can be used. Run the following commands:

* `npm install`
* `npm run build`
* `npm start`

If you also need debugging you can run:

* `npm run start:debug` - which will allow you to attach a debugger

After starting the service, you can navigate to http://localhost:7000/ in a browser. Click the login and sign in using your corp credential. Start using the apps!

## Kubernetes and Draft
We use [Kubernetes](https://kubernetes.io/) to deploy our app. [Draft](https://github.com/Azure/draft) is a great developer tool for easy kubernetes app development and building.

### Prerequisities to run locally
**Update(02/16/2018):** Due to our recent migration to nginx and https, running locally in minikube won't work for now. But all the steps will still work on remote kubernetes cluster.

Checkout [this](https://github.com/Azure/draft/blob/master/docs/install.md) to install draft and prerequisities. Locally we use [minikube](https://github.com/kubernetes/minikube) to deploy. This will mimic a production kube cluster environment.
Before you start, run these commands to create a local registry for minikube and point draft to pull images from the local registry.

* `minikube addons enable registry`
* `draft init --auto-accept`

Refer to [this](https://github.com/Azure/draft/blob/master/docs/install.md) for more explanation.

### Steps
* `draft create -a <app-name>` with generate helm chart and toml file for deployment.
* `kubectl config get-contexts` will show the available contexts.
* `kubectl config use-context minikube` will switch the context to minikube.

Once you are in minikube context, run:
* `draft up`

This will create a new container in the local registry. Draftd (the draft server) installed in minikube cluster is already configured to pull the latest image from the registry.

Once done, run the following command to list all running pods.
* `kubectl get pods --namespace tenants`

Forward the port to http://localhost:7000 to start running the app.
* `kubectl port-forward --namespace tenants <pod-name> 7000:3000`

### Run in remote cluster
Once everything is configured, Draft makes it incredibly simple to switch deployment between local (minikube) and prod. Just make sure to switch the context using the following command.
* `kubectl config use-context <prod-context-name>` will switch the context prod cluster.

Every other steps remains exactly the same.