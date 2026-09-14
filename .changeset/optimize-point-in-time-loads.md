---
"@fluidframework/container-loader": minor
"@fluidframework/odsp-driver": minor
"__section": fix
---
Improve point-in-time container load performance

Point-in-time loads now reuse the historical snapshot fetched during base selection and avoid a
separate request for that snapshot's epoch. Deep version histories use exponential probing followed
by binary search instead of resolving every newer version, while preserving uncached historical
snapshot selection. New load telemetry reports total duration, base and target sequence numbers, and
the number of replayed operations.
