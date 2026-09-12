#!/bin/sh
set -eu

output=${1:-.certs}
mkdir -p "$output"
chmod 700 "$output"
openssl ecparam -name prime256v1 -genkey -noout -out "$output/key.pem"
chmod 600 "$output/key.pem"
openssl req -new -x509 -sha256 -days 13 \
    -key "$output/key.pem" \
    -out "$output/cert.pem" \
    -subj '/CN=localhost' \
    -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
openssl x509 -in "$output/cert.pem" -outform DER \
    | openssl dgst -sha256 -binary \
    | od -An -tx1 \
    | tr -d ' \n' > "$output/cert.sha256"
printf '\n' >> "$output/cert.sha256"
printf 'certificate=%s\nprivate_key=%s\nsha256=%s\n' \
    "$output/cert.pem" "$output/key.pem" "$(cat "$output/cert.sha256")"
