# ---------------------------------------------------------
# D1 Databases
# ---------------------------------------------------------

resource "cloudflare_d1_database" "production" {
  account_id = var.cloudflare_account_id
  name       = var.d1_production_name
}

resource "cloudflare_d1_database" "staging" {
  account_id = var.cloudflare_account_id
  name       = var.d1_staging_name
}

# ---------------------------------------------------------
# Cron Triggers
#
# Workers script must be deployed via `wrangler deploy` before
# applying cron triggers. Use `terraform apply -target=...`
# to skip these on first run.
# ---------------------------------------------------------

resource "cloudflare_worker_cron_trigger" "production" {
  account_id  = var.cloudflare_account_id
  script_name = var.workers_script_name
  schedules = [
    "0 * * * *",  # Spreadsheet → D1 config sync (hourly)
    "0 18 * * *", # Failed email retry (daily 03:00 JST)
  ]
}

resource "cloudflare_worker_cron_trigger" "staging" {
  account_id  = var.cloudflare_account_id
  script_name = var.workers_staging_script_name
  schedules = [
    "0 * * * *",
    "0 18 * * *",
  ]
}
