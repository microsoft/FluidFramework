# IFrame Socket Storage
This is an implementation of a driver which provides a DocumentService which consumes another socket storage
and then proxies that documentstorage across the iframe boundary. The innerframe can interact
with the existing endpoints like Document Storage, Delta Storage and Delta stream.
It provides implementation of Document Storage, Delta Storage and Delta stream.