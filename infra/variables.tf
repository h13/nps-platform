variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "asia-northeast1"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "d1_production_name" {
  description = "D1 database name for production"
  type        = string
  default     = "nps-platform"
}

variable "d1_staging_name" {
  description = "D1 database name for staging"
  type        = string
  default     = "nps-platform-staging"
}

variable "workers_script_name" {
  description = "Cloudflare Workers script name for production"
  type        = string
  default     = "nps-platform"
}

variable "workers_staging_script_name" {
  description = "Cloudflare Workers script name for staging"
  type        = string
  default     = "nps-platform-staging"
}

variable "sa_key_rotation_id" {
  description = "Change this value to trigger SA key rotation (e.g. '2026-03')"
  type        = string
  default     = "1"
}
