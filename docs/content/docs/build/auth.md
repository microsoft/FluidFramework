---
title: "Authentication & authorization"
menuPosition: 3
editor: tylerbutler
---

Security is critical to modern web applications. Fluid Framework, as a part of your web application architecture, is an
important piece of infrastructure to secure. Fluid Framework is a layered architecture, and auth-related concepts are implemented based on the Fluid service it's connecting to. This means that the specifics of authentication will differ based on the Fluid service.

The information below is based on Azure Fluid Relay service but also applies to
[Tinylicious]({{< relref "tinylicious.md" >}}). Other Fluid services may differ.

## Azure Fluid Relay service

{{< include file="_includes/frs-onboarding.html" safeHTML=true >}}

Each FRS tenant you create is assigned a *tenant ID* and its own unique *tenant secret key*.

The secret key is a *shared secret*. Your app/service knows it, and FRS knows it. This means that you can sign data
using that secret key, and FRS can verify that it is you who signed those requests because it also has that key.

In summary, the secret key is how the Azure Fluid Relay service knows that requests are coming from your app or service. This is critical, because once the Azure Fluid Relay service can trust that it's *your app* making the requests, it can trust the data you send. This is also why it's important that the secret is handled securely.

{{% callout warning %}}
Anyone with access to the secret can impersonate your application when communicating with Azure Fluid Relay service.
{{% /callout %}}

Now you have a mechanism to establish trust. You can sign some data, send it to the Azure Fluid Relay service, and the service can validate whether the
data is signed properly, and if so, it can trust it. Fortunately, there's an industry standard way method for encoding
authentication and user-related data with a signature for verification: JSON Web Tokens (JWTs).

{{% callout note %}}

The specifics of JWTs are beyond the scope of this article. For more details about the JWT standard see
<https://jwt.io/introduction>.

{{% /callout %}}

JSON Web Tokens are a signed bit of JSON that can include additional information about the rights conferred by the
JWT. The Azure Fluid Relay service uses signed JWTs for establishing trust with calling clients.

The next question is: what data should you send?

You need to send your *tenant ID* so that FRS can look up the right secret key to validate your request. You need to
send the *container ID* (called `documentId` in the JWT) so FRS knows which container the request is about. Finally, you
need to also set the *scopes (permissions)* that the request is permitted to use -- this allows you to establish your
own user permissions model if you wish.

```json {linenos=inline,hl_lines=["5-6",9]}
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

Every request to Azure Fluid Relay must be signed with a valid JWT. The Azure Fluid Relay documentation contains additional details about [how to
sign the token][1]. Fluid delegates the responsibility of creating and signing these tokens to a *token provider.*

[1]: (https://github.com/MicrosoftDocs/azure-fluid-preview-pr/blob/main/azure-fluid-relay-preview-pr/articles/howtos/fluid-jwtoken.md#how-can-you-generate-an-azure-fluid-relay-token)

{{% callout title="More information" %}}

* [Introduction to JWTs](https://jwt.io/introduction)
* [Payload claims in Azure Fluid Relay](https://github.com/MicrosoftDocs/azure-fluid-preview-pr/blob/main/azure-fluid-relay-preview-pr/articles/howtos/fluid-jwtoken.md#payload-claims)
* [Scopes in Azure Fluid Relay](need a url)
* [Signing requests](https://github.com/MicrosoftDocs/azure-fluid-preview-pr/blob/main/azure-fluid-relay-preview-pr/articles/howtos/fluid-jwtoken.md#how-can-you-generate-an-azure-fluid-relay-token)

{{% /callout %}}

## The token provider

A token provider is responsible for creating and signing tokens that the `@fluid-experimental/frs-client` uses to make requests to the
Azure Fluid Relay service. You are required to provide your own secure token provider implementation.
However, Fluid provides an `InsecureTokenProvider` that accepts your FRS tenant secret and returns signed tokens. This
token provider is useful for testing, but in production scenarios you must use a secure token provider.

### A secure serverless token provider

One option for building a secure token provider is to create a serverless Azure Function and expose it as a token
provider. This enables you to store the *tenant secret key* on a secure server. Your application calls the Function to generate tokens rather than signing them locally like the `InsecureTokenProvider` does.

An example of such a function is available at <https://github.com/microsoft/FrsAzureFunctions>. There is a
corresponding `FrsAzFunctionTokenProvider` for this Function in the `@fluid-experimental/frs-client` package.

## Adding custom data to tokens

Why would you do this? How does it work?

## Connecting user auth to Fluid service auth

You do this in your token provider. For example, you could make your Azure Function token provider authenticated. If an
application tries to call the Function it would fail unless authenticated with your auth system. If you're using Azure
Active Directory, for example, you might create an AAD application for your Azure Function, and tie it to your
organization's auth system.

In this case the user would sign into your application using AAD, through which you would obtain a token to use to call
your Azure Function. The Azure Function itself behaves the same, but it's now only accessible to people who have also
authenticated with AAD.

Since the Azure Function is now your entrypoint into obtaining a valid token, only users who have properly authenticated to the Function will then be able to relay that token to the Azure Fluid Relay service from their client application. This two-step approach allows you to use your own custom authentication process in conjunction with the Azure Fluid Relay service.
