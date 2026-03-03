.PHONY: init plan apply output secrets fmt validate lint security check hooks

init:
	terraform init

plan:
	terraform plan

apply:
	terraform apply

output:
	terraform output

secrets:
	./scripts/push-secrets.sh

fmt:
	terraform fmt -check -recursive

validate:
	terraform validate

lint:
	tflint --init
	tflint

security:
	trivy config .

check: fmt lint security

hooks:
	ln -sf ../../infra/scripts/pre-commit-terraform.sh ../.git/hooks/pre-commit.local
	@echo "pre-commit.local hook installed."
