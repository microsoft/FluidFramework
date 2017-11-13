{{/* vim: set filetype=mustache: */}}

{{/* TODO: there must be a better way to unify these names? */}}

{{/*
Expand the name of the chart.
*/}}
{{- define "routerlicious.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "routerlicious.fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified client name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "alfred.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.alfred.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified data name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "deli.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.deli.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified master name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "scriptorium.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.scriptorium.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified master name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "routemaster.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.routemaster.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified master name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "tmz.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.tmz.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified master name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "paparazzi.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.paparazzi.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
