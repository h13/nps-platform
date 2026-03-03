# ---------------------------------------------------------
# Google Cloud APIs
# ---------------------------------------------------------

resource "google_project_service" "sheets" {
  service            = "sheets.googleapis.com"
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

# ---------------------------------------------------------
# Service Account Keys
# ---------------------------------------------------------

resource "google_service_account_key" "sheets_reader" {
  service_account_id = google_service_account.sheets_reader.name
  keepers = {
    rotation = var.sa_key_rotation_id
  }
}
