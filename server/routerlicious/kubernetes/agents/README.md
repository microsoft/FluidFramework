We use minio to store and serve modules. Minio is deployed using official kubernets [chart](https://github.com/kubernetes/charts/tree/master/stable/minio). To deploy minio, Run:

Production:
```bash
$ helm install --name agents-storage --set accessKey=prague --set secretKey=mhioAkNXTwdX4dXWgKgXVtHo --set persistence.size=20Gi stable/minio
```

PPE:
```bash
$ helm install --name agents-storage-ppe --set accessKey=prague --set secretKey=mhioAkNXTwdX4dXWgKgXVtHo --set persistence.size=20Gi stable/minio
```
