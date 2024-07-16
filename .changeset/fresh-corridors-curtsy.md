---
"@fluidframework/tinylicious-client": minor
---

tinylicious-client: Promote APIs from `@beta` to `@public`

Some tinylicious-client APIs were marked beta in previous releases. These APIs are now correctly marked public. the
`TinyliciousClient` class is also sealed to indicate it is not to be implemented externally to Fluid Framework and not
changed.

Updated APIs:

- [ITinyliciousAudience](https://fluidframework.com/docs/api/v2/tinylicious-client/itinyliciousaudience-typealias)
- [TinyliciousClient](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousclient-class) sealed
- [TinyliciousClientProps](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousclientprops-interface)
- [TinyliciousConnectionConfig](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousconnectionconfig-interface)
- [TinyliciousContainerServices](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciouscontainerservices-interface)
- [TinyliciousMember](https://fluidframework.com/docs/api/v2/tinylicious-client/tinyliciousmember-interface)
- [TinyliciousUser](https://fluidframework.com/docs/api/v2/tinylicious-client/tinylicioususer-interface)
