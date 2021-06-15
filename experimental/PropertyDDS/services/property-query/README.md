# @fluid-experimental/property-query
# Materialized History Service
A service that maintains a representation of the commit history which allows random access at arbitrary commits.
  
## Overview
The Materialized History's purpose is to maintain an alternate data representation that efficiently allows random access and searching through the properties of a property tree as well as providing queriability on the structure. Such structure is implemented as Versioned B-Trees, where a new commit is materialized as a partial tree, where the unaffected leaves are references to previous trees in time.

### Access patterns
These access patterns apply to fetching the state at a point in time or _materialized view_ as well as for a _commit_.

#### Read a sub-tree
It is possible to obtain the whole, or many sub-trees from the data representation at any point in time, by specifying filtering by no (all) properties, or specific sub-trees.

#### Chunked data access
It is possible to consume a property tree in the chunks of a specific size, to reduce the access time.

#### Ranged data access
It is possible to consume all data comprised between two paths.

#### Paging and sorting
It is possible to perform sorted paging on the direct children as a data source to user interfaces that display data in a paged fashion using the QueryV1 language.
  
## Running the server
 1. Start the dependency databases using `tools/dbStart.sh`
 2. Start the PropertySetsServer using `npm start` under `services/propertysets`
 3. Start the Materialized History Service using `npm start`.
 
## Debugging the server
 1. Start the dependency databases using `tools/dbStart.sh`
 2. Start the PropertySetsServer using `npm start` under `services/propertysets`
 3. Start the Materialized History Service using `node --debug-brk --inspect server.js`.
 
## Architecture
See `documentation/mhs_architecture.md`

## Settings
See `config/settings.json` to obtain information about all available configuration options.

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
