export const settings = {
    alfred: {
        topic: "rawdeltas",
    },
    deli: {
        topics: {
            receive: "rawdeltas",
            send: "deltas"
        },
    },
    eventHub: {
        endpoint: "Endpoint=sb://praguefunctions.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=wG+GMs96eqaD5pqTQYzxZuI1pkRI90JcshAw3QUWI4k=",
    },
    mongo: {
        collectionNames: {
            deltas: "deltas",
            documents: "documents",
            partitions: "partitions",
            tenants: "tenants",
            nodes: "nodes",
            reservations: "reservations"
        },
        endpoint: "mongodb://praguefunctions:JYfJyAUDWabe1dKOqJL4NznmDW6we410f3yWyOvKLrES07BTvwcXbB9XSNjUnPt9UAaz07mag525MTthD1KXcw==@praguefunctions.documents.azure.com:10255/?ssl=true&replicaSet=globaldb",
    },
    redis: {
        host: "praguelambdas.redis.cache.windows.net",
        key: "tyro1IMxDj3n2mSBULmJWBKywuLKLlp9cRw+bcfsUZs=",
        port: 6380
    }
}
