---
title: "Authentication & authorization"
menuPosition: 3
editor: tylerbutler
---

Security is critical to modern web applications. Fluid Framework, as a part of your web application architecture, is an
important piece of infrastructure to secure. Fluid Framework is a layered architecture, and auth-related concepts are
primarily a concern of the *driver* layer (see [Architecture]({{< relref "architecture.md" >}})). This means that the
specifics of authentication could differ based on the Fluid service and its driver.

The information below is based on Azure Fluid Relay service but also applies to
[Tinylicious]({{< relref "tinylicious.md" >}}). Other Fluid services may differ.

{{< include file="_includes/frs-onboarding.html" safeHTML=true >}}

## Azure Fluid Relay service

FRS provides you a tenant ID and secret key.

The secret key is a *shared secret*. Your app/service knows it, and FRS knows it. This means that you can sign data
using that secret key, and FRS can verify that it is you who signed those requests because it also has that key.

In summary, the secret key is how FRS knows that requests are coming from your app or service. This is critical, because
once FRS can trust that it's *your app* making the requests, it can trust the data you send. This is also why it's so
important that the secret is handled securely. Anyone with access to it can impersonate your application to FRS.

Now you have a mechanism to establish trust. You can sign some data, send it to FRS, and FRS can validate whether the
data is signed properly, and if so, it can trust it. Fortunately, there's an industry standard way method for encoding
authentication and user-related data with a signature for verification: JSON Web Tokens (JWT).

The next question is: what data should you send?

### JSON Web Tokens (JWT)

{{% callout %}}

Something.

{{% /callout %}}

JSON Web Tokens are the data format that Tinylicious and Azure Fluid Relay service (FRS) use for authentication.


The specifics of JWTs are beyond the scope of this article.

```json
{
  "alg": "HS256",
  "typ": "JWT"
}.{
  "documentId": "azureFluidDocumentId",
  "scopes": [ "doc:read", "doc:write", "summary:write" ],
  "iat": 1599098963,
  "exp": 1599098963,
  "tenantId": "AzureFluidTenantId",
  "ver": "1.0"
}.[Signature]
```


{{% callout %}}

The sections below assume you're familiar with

{{% /callout %}}



You need to send your tenant ID so that FRS can look up the right secret key to validate your request. You need to send
the container ID so FRS knows which container the request is about. Finally, you need to also set the scopes
(permissions) that the request is permitted to use -- this allows you to establish your own permissions model if you
wish.



[FRS JWT]: https://github.com/MicrosoftDocs/azure-fluid-preview-pr/blob/main/azure-fluid-relay-preview-pr/articles/howtos/fluid-jwtoken.md
[claims]: https://github.com/MicrosoftDocs/azure-fluid-preview-pr/blob/main/azure-fluid-relay-preview-pr/articles/howtos/fluid-jwtoken.md#payload-claims
