# ---------------------------------------------------------
# Google Cloud APIs
# ---------------------------------------------------------

resource "google_project_service" "sheets" {
  service            = "sheets.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "bigquery" {
  service            = "bigquery.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

# ---------------------------------------------------------
# Service Accounts
# ---------------------------------------------------------

resource "google_service_account" "sheets_reader" {
  account_id   = "nps-spreadsheet-reader"
  display_name = "NPS Spreadsheet Reader"
  description  = "Read-only access to NPS config spreadsheet"
}

resource "google_service_account" "bigquery_writer" {
  account_id   = "nps-bigquery-writer"
  display_name = "NPS BigQuery Writer"
  description  = "Write NPS responses to BigQuery"
}

# ---------------------------------------------------------
# Service Account Keys
# ---------------------------------------------------------

resource "google_service_account_key" "sheets_reader" {
  service_account_id = google_service_account.sheets_reader.name
  keepers = {
    rotation = var.sa_key_rotation_id
  }
}

resource "google_service_account_key" "bigquery_writer" {
  service_account_id = google_service_account.bigquery_writer.name
  keepers = {
    rotation = var.sa_key_rotation_id
  }
}

# ---------------------------------------------------------
# BigQuery Dataset
# ---------------------------------------------------------

resource "google_bigquery_dataset" "nps" {
  dataset_id = "nps_responses"
  location   = var.gcp_region

  access {
    role          = "OWNER"
    special_group = "projectOwners"
  }

  access {
    role          = "WRITER"
    user_by_email = google_service_account.bigquery_writer.email
  }
}

# ---------------------------------------------------------
# IAM Bindings
#
# bigquery.jobUser is project-level (required to run jobs).
# Data access is scoped to the nps_responses dataset above.
# ---------------------------------------------------------

resource "google_project_iam_member" "bigquery_job_user" {
  project = var.gcp_project_id
  role    = "roles/bigquery.jobUser"
  member  = "serviceAccount:${google_service_account.bigquery_writer.email}"
}
