We use minio to store and serve modules. Minio is deployed using official kubernets [chart](https://github.com/kubernetes/charts/tree/master/stable/minio). To deploy minio. Run:

```bash
$ helm install --name agents-storage ./minio/
```