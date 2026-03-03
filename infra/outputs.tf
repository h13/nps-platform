# ---------------------------------------------------------
# D1
# ---------------------------------------------------------

output "d1_production_id" {
  description = "D1 database ID for production"
  value       = cloudflare_d1_database.production.id
}

output "d1_staging_id" {
  description = "D1 database ID for staging"
  value       = cloudflare_d1_database.staging.id
}

# ---------------------------------------------------------
# Service Account Emails
# ---------------------------------------------------------

output "sheets_reader_email" {
  description = "Sheets reader service account email"
  value       = google_service_account.sheets_reader.email
}

output "bigquery_writer_email" {
  description = "BigQuery writer service account email"
  value       = google_service_account.bigquery_writer.email
}

# ---------------------------------------------------------
# Service Account Keys (sensitive)
# ---------------------------------------------------------

output "sheets_sa_key_json" {
  description = "Sheets reader SA key (base64-encoded JSON)"
  value       = google_service_account_key.sheets_reader.private_key
  sensitive   = true
}

output "bigquery_sa_key_json" {
  description = "BigQuery writer SA key (base64-encoded JSON)"
  value       = google_service_account_key.bigquery_writer.private_key
  sensitive   = true
}
