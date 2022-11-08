# @fluidframework/iframe-driver

**The iframe-driver is deprecated and should not be used, it will be removed in an upcoming release**

This is an implementation of a driver which provides a DocumentService which consumes another socket storage
and then proxies that document storage across the iframe boundary. The inner frame can interact
with the existing endpoints like Document Storage, Delta Storage and Delta stream.
It provides implementation of Document Storage, Delta Storage and Delta stream.