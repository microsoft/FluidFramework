{{/* vim: set filetype=mustache: */}}

{{/*
Create a default fully qualified master name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "kafka.fullname" -}}
{{- printf "%s-%s" .Release.Name "kafka" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified master name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "zookeeper.fullname" -}}
{{- printf "%s-%s" .Release.Name "zookeeper" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
