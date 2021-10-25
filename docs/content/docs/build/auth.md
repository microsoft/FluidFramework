---
title: "Authentication & authorization"
menuPosition: 3
editor: tylerbutler
---

Security is critical to modern web applications. Fluid Framework, as a part of your web application architecture, is an
important piece of infrastructure to secure. Fluid Framework is a layered architecture, and auth-related concepts are implemented based on the Fluid service it's connecting to. This means that the specifics of authentication will differ based on the Fluid service.

The information below is based on Azure Fluid Relay. Other Fluid services may differ. See [Available Fluid
services]({{< relref "service-options.md" >}}) for more information.

## Azure Fluid Relay

{{< include file="_includes/azureFluidRelay-onboarding.html" safeHTML=true >}}

Each Azure Fluid Relay tenant you create is assigned a *tenant ID* and its own unique *tenant secret key*.

The secret key is a *shared secret*. Your app/service knows it, and the Azure Fluid Relay knows it. Since the
tenant secret key is uniquely tied to your tenant, using it to sign requests guarantees to the Azure Fluid Relay
that the requests are coming from an authorized user of the tenant.

In summary, the secret key is how the Azure Fluid Relay knows that requests are coming from your app or service. This is critical, because once the Azure Fluid Relay can trust that it's *your app* making the requests, it can trust the data you send. This is also why it's important that the secret is handled securely.

{{% callout warning %}}
Anyone with access to the secret can impersonate your application when communicating with Azure Fluid Relay.
{{% /callout %}}

Now you have a mechanism to establish trust. Your app can sign some data, send it to the Azure Fluid Relay, and the service can validate whether the
data is signed properly, and if so, it can trust it. Fortunately, there's an industry standard method for encoding
authentication and user-related data with a signature for verification: JSON Web Tokens (JWTs).

## JWTs and Azure Fluid Relay

{{% callout note %}}

The specifics of JWTs are beyond the scope of this article. For more details about the JWT standard see
<https://jwt.io/introduction>.

{{% /callout %}}

JSON Web Tokens are a signed bit of JSON that can include additional information about the rights conferred by the
JWT. Azure Fluid Relay uses signed JWTs for establishing trust with calling clients.

The next question is: what data should your app send?

The app must send the *tenant ID* so that Azure Fluid Relay can look up the right secret key to validate the
request. The app also must send the *container ID* (called `documentId` in the JWT) so Azure Fluid Relay knows which
container the request is about. Finally, the app must also set the *scopes (permissions)* that the request is permitted
to use -- this enables you to establish your own user permissions model if you wish.

```json {linenos=inline,hl_lines=["5-6",13]}
{
  "alg": "HS256",
  "typ": "JWT"
}.{
  "documentId": "azureFluidDocumentId",
  "scopes": [ "doc:read", "doc:write", "summary:write" ],
  "user": {
    "name": "TestUser",
    "id": "Test-Id-123"
  },
  "iat": 1599098963,
  "exp": 1599098963,
  "tenantId": "AzureFluidTenantId",
  "ver": "1.0"
}.[Signature]
```

{{% callout tip %}}

Note that the token also includes user information (see lines 7-9 above). You can use this to augment the user
information that is automatically available to Fluid code using the [audience][] feature. See [Adding custom data to
tokens][custom] for more information.

[audience]: {{< relref "audience.md" >}}
[custom]: {{< relref "#adding-custom-data-to-tokens" >}}

{{% /callout %}}

Every request to Azure Fluid Relay must be signed with a valid JWT. The Azure Fluid Relay documentation contains additional details about [how to
sign the token][1]. Fluid delegates the responsibility of creating and signing these tokens to a *token provider.*

[1]: https://github.com/MicrosoftDocs/azure-fluid-preview-pr/blob/main/azure-fluid-relay-preview-pr/articles/howtos/fluid-jwtoken.md#how-can-you-generate-an-azure-fluid-relay-token

{{% callout note "More information" %}}

* [Introduction to JWTs](https://jwt.io/introduction)
* [Payload claims in Azure Fluid Relay](https://github.com/MicrosoftDocs/azure-fluid-preview-pr/blob/main/azure-fluid-relay-preview-pr/articles/howtos/fluid-jwtoken.md#payload-claims)
* Scopes in Azure Fluid Relay
* [Signing requests](https://github.com/MicrosoftDocs/azure-fluid-preview-pr/blob/main/azure-fluid-relay-preview-pr/articles/howtos/fluid-jwtoken.md#how-can-you-generate-an-azure-fluid-relay-token)

{{% /callout %}}

## The token provider

A token provider is responsible for creating and signing tokens that the `@fluidframework/azure-client` uses to make
requests to the Azure Fluid Relay. You are required to provide your own secure token provider implementation.
However, Fluid provides an `InsecureTokenProvider` that accepts your tenant secret, then locally generates and returns a signed token. This token provider is useful for testing, but in production scenarios you must use a secure token provider.

### A secure serverless token provider

One option for building a secure token provider is to create a serverless Azure Function and expose it as a token
provider. This enables you to store the *tenant secret key* on a secure server. Your application calls the Azure Function to
generate tokens rather than signing them locally like the `InsecureTokenProvider` does. You can find more information regarding secure token generation on [Tutorial: Writing a TokenProvider with an Azure Function]({{< relref "tokenproviders.md" >}}).

## Connecting user auth to Fluid service auth

You do this in your token provider. For example, you could make your Azure Function token provider authenticated. If an
application tries to call the Function it would fail unless authenticated with your auth system. If you're using Azure
Active Directory (Azure AD), for example, you might create an Azure AD application for your Azure Function, and tie it
to your organization's auth system.

In this case the user would sign into your application using Azure AD, through which you would obtain a token to use to
call your Azure Function. The Azure Function itself behaves the same, but it's now only accessible to people who have
also authenticated with Azure AD.

Since the Azure Function is now your entrypoint into obtaining a valid token, only users who have properly authenticated
to the Function will then be able to relay that token to the Azure Fluid Relay from their client application.
This two-step approach enables you to use your own custom authentication process in conjunction with the Azure Fluid
Relay service.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[FluidContainer]: {{< relref "fluidcontainer.md" >}}
[IFluidContainer]: {{< relref "ifluidcontainer.md" >}}
[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedNumberSequence]: {{< relref "sequences.md#sharedobjectsequence-and-sharednumbersequence" >}}
[SharedObjectSequence]: {{< relref "sequences.md#sharedobjectsequence-and-sharednumbersequence" >}}
[SharedSequence]: {{< relref "sequences.md" >}}
[SharedString]: {{< relref "string.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
