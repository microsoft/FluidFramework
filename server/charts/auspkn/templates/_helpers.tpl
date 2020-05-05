{{/* vim: set filetype=mustache: */}}

{{- define "auspkn.fullname" -}}
{{- printf "%s-%s" .Release.Name "auspkn" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
