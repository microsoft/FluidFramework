# @fluid-internal/hosts-sample

The Fluid loader is all that is needed to load any Fluid document. This example walks through all the steps to
create, initialize, and then make use of the loader. And does so in a literate programming like style to provide
more detail on each line of the code.

There are other packages which provide simple APIs to make use of the loader. For example @fluidframework/base-host.
These may be better starting options when integrating the loader into your own code. But this example will show all
the steps needed to create and use the Fluid loader. And it still comes in under 200 lines
of code.

## Build steps

Getting up and running is simple.

```bash
npm install
npm start
```

Then navigate to <http://localhost:8080.> This will redirect you to <http://localhost:8080/example> but you can change
'example' to any string you'd like and a new document will be created under that name. By default a new Flow View
will be created but by specifying the chaincode query parameter any of the packages on
<https://packages.wu2.prague.office-int.com> can be loaded - i.e.
<http://localhost:8080/new-document?chaincode=@fluid-example/smde@0.18.1>

## The Code

### Packages

The loader itself only requires two Fluid packages: `@fluidframework/container-definitions` and `@fluidframework/container-loader`.

`@fluidframework/container-loader` contains the actual loader itself.

`@fluidframework/container-definitions` is a set of TypeScript interface definitions that define the behavior of the loader.
These provide the bindings between the loader code itself and the documents loaded by the loader.

### Creating the Loader

Creating a loader is a simple process

```typescript
import { Loader } from "@fluidframework/container-loader";

const loader = new Loader({
    urlResolver,
    documentServicesFactory,
    codeLoader,
});
```

The loader takes in four parameters. The first is a set of host interfaces. These allow the loader to interact with
the host for identity and access control related tasks like URL resolution. The second contains the driver factory.
This allows the loader to communicate with the service hosting the Fluid document. The third parameter defines the
code loader used to load the code defined in the Fluid document. And finally the last parameter is a set of options
used during the actual load.

Each of these will be described in more detail in the sections that follow.

#### Host Platform

There are certain tasks that require the host's help to complete. These are defined via the host interfaces.

As a library the loader does not have full context on the identity of the user. This is defined by the session the user
has established with the web server that served the web page being viewed. As such the Fluid loader defers
certain tasks to the host page when identity or access control is involved.

The primary of these is resolving a URL to its Fluid specific endpoint and access tokens. Sites hosting Fluid
documents are free to define any URL scheme they want to represent a document. But they must then be able to map
from this URL to a Fluid based url of the form:

`fluid-protocol://service.domain/documentId/path`

And also provided the required access tokens with this. In the above the protocol part of the URL defines which Fluid
driver to use to to talk to the server. The domain gives the location of the service. Document ID is the identifier for
the Fluid document. And finally the path is a string handed down to the document itself and allows it to select which
Fluid object to render and parameters for it.

Deferring to the host for this resolution allows it to perform access control checks on the user's identity and only
return the resolved Fluid URL with access tokens if these pass.

In this sample we aren't doing any user authentication and are running client side only with the API tokens hard
coded into the sample. This is NOT a security best practice and is only intended to be used to simplify the loader
sample. To make this clear we call our URL resolver the `InsecureUrlResolver`. In a production environment the
tenant secret should be protected on the service as you would a database password, SSL private key, etc... and the
URL resolver would make an authenticated API call against a server API to receive the resulting information.

That warning out of the way let's dig in to the `IUrlResolver`.

The `IUrlResolver` interface is defined as

```typescript
export interface IUrlResolver {
    resolve(request: IRequest): Promise<IResolvedUrl>;
    getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string>;
}
```

This simple interface defines a method, `resolve`, which takes in an `IRequest` object and resolves it to an
`IResolvedUrl`. An `IRequest` is simply the URL for the document. And the `IResolvedUrl` is the Fluid based URL
along with associated access tokens.

In our example the URL format is of the form `http://localhost:8080/<documentId>/<path>`. To implement the resolve
method we then parse a URL of this form into the associated fluid:// based URL.

To do so we first start by parsing the full URL and extracing the document ID out of the URL

```typescript
const parsedUrl = new URL(request.url);
const documentId = parsedUrl.pathname.substr(1).split("/")[0];
```

Once those are available we can construct the full Fluid url as

```typescript
const documentUrl = `fluid://${new URL(this.ordererUrl).host}` +
    `/${encodeURIComponent(this.tenantId)}` +
    parsedUrl.pathname;
```

We can then construct the final `IFluidResolvedUrl` by generating all the endpoints needed by the driver. As well as
crafting a JWT token locally (this is the insecure part) which can be used to connect to these endpoints.

```typescript
const deltaStorageUrl =
    `${this.ordererUrl}/deltas/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(documentId)}`;

const storageUrl = `${this.storageUrl}/repos/${encodeURIComponent(this.tenantId)}`;

const response: IFluidResolvedUrl = {
    endpoints: {
        deltaStorageUrl,
        ordererUrl: this.ordererUrl,
        storageUrl,
    },
    tokens: { jwt: this.auth(this.tenantId, documentId) },
    type: "fluid",
    url: documentUrl,
};

return response;
```
It also defines an api, `getAbsoluteUrl` which takes 2 arguments, `resolvedUrl` and `relativeUrl`. It creates a url for
the created container with any data store path given in the relative url.

#### Drivers

Similar to how the loader defers certain tasks to the host it also defers how to establish a connection to a Fluid
service to a set of driver code. This allows the loader to be agnostic to the wire protocol a Fluid service may
define so long as code is provided that correctly implements the loader's driver interface.

In this example the Routerlicious driver is used `@fluidframework/routerlicious-driver`. But drivers also exist to
talk to OneDrive/SharePoint.

Creating this is simple

```typescript
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";

const documentServicesFactory = new RouterliciousDocumentServiceFactory();
```

The driver factory is then passed to the loader. Internally the loader then binds the data returned from the
host resolver to the associated driver.

Although not fully utilized yet the protocol part of the Fluid URL is used to determine which driver to make use of -
i.e. fluid-routerlicious:// would indicate the routerlicious driver/protocol should be used, while the fluid-spo://
would indicate the SharePoint driver is required.

#### Code Loader

At its core a Fluid document is a code plus data package. The operation stream defines the code to run in addition
to containing the operations to run against the underlying data types. This is very similar to a the traditional web
model where HTML is combined with script tags.

Because the loader is designed to work in both the browser and in node.js, both of which have different code loading
mechanisms, the loader takes in an interface which provides the ability to dynamically load a code package. This also
would allow a host to implement allowlisting, or other access controls, of which code to load.

The interface for the loader is also simple.

```typescript
export interface ICodeLoader {
    load(source: string): Promise<IChaincodeFactory>;
}
```

load takes in a source string. Today this is an npm package. But similar to npm package references is expected to
grow into git repos, tarballs, CDN links, etc...

The IChaincodeFactory is a simple interface that defines the entry point function the loader expects the code
package to export.

```typescript
export interface IChaincodeFactory {
    instantiateRuntime(context: IContainerContext): Promise<IRuntime>;
}
```

Once the `IChaincodeFactory` is returned the loader then invokes the instantiateRuntime call to load the code package.

### Creating a Fluid document

Once the loader has been created then actually creating a Fluid document is very simple

```typescript
const container = await loader.createDetachedContainer(codeDetails);
await container.attach(request);
```
In first line, we actually create an in-memory container without creating it on the actual storage. `codeDetails`
is the code package to run for the container. It provides benefits like freaky fast container creation so that the
user can start editing the container immediately and we don't have to propose code through the quorum.

In the second line, we call attach on the container to actually create it on the storage. This is async and can
be done in the background while the user is editing the container. It takes in a `request` which is a `createNewRequest`
which can be resolved by the resolver. This resolved url might not contain the endpoints because the container is not yet
created. The resolver can also provide this api on its instance to create the `createNewRequest`.

### Loading a Fluid Document

Loading a Fluid document is a one line call

```typescript
const response = await loader.request({ url });
```

Internally the loader is then using the host interface to resolve the URL, creating a driver to connect to the
resolved URL, and then connecting to the document. The path part of the URL is then provided to the document and
used to route the request to an object. In many ways you can view the Fluid document like a traditional web
server that is returning a web page. But in the Fluid case a live, collaborative object is returned.

Like a web server a status code is returned to indicate the success of the request. For consistency we match HTTP
status codes.

```typescript
if (response.status !== 200) {
    return;
}
```

A mime type is also provided with the request to distinguish the type of object.  The most common thing you'll receive
is a Fluid object. Fluid objects implement the attach interface which allow them to participate in the web
model. But a document could also return different mime types like static images, videos, etc...

The host can then switch on the mime type and act accordingly. In the case of the Fluid object, we check if is a viewable
and provide it a div for it to render.

```typescript
switch (response.mimeType) {
    case "fluid/object":
        // Check if the object is a view
        const fluidObject = response.value as IFluidObject;
        const view = fluidObject.IFluidHTMLView;
        if (!view) {
            return;
        }

        view.render(div, { display: "block" });
        break;
}
```

#### IFluidObject interface

The Fluid object model supports a delegation and feature detection mechanism. As is typical in JavaScript,
a feature detection pattern can be used to determine what capabilities are exposed by an object. The `IFluidObject`
interface serves as a Fluid-specific form of “any” that clients can cast objects to in order to probe for implemented
object interfaces. For example, if you need to determine the capabilities that an object exposes, you first
cast the object as an `IFluidObject`, and then access the property on the `IFluidObject` that matches the interface you
are testing for.  The above checks if the object implements `IFluidHTMLView`, and uses it to get the instance
that implements the rendering capability.

## Next Steps

And that's all that's needed to create or load Fluid documents. It's intended to be light weight and simple to get
setup as a host. And once done you gain full access to the power of the Fluid platform.

Instructions for that are at https://github.com/Microsoft/FluidFramework/blob/main/tools/generator-fluid/README.md.
You can then publish this package to Verdaccio and load it inside of your new loader!

When creating your new Fluid object also note that the API provides it access to the underlying loader. You can use this
to follow similar attach steps as above to load objects within your objects. In this way your Fluid object can
also serve as a host for other Fluid content.
