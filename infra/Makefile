.PHONY: init plan apply output secrets fmt validate lint security shellcheck check hooks

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
	trivy config --config trivy.yaml .

shellcheck:
	shellcheck scripts/*.sh

check: fmt lint security shellcheck

hooks:
	ln -sf ../../infra/scripts/pre-commit.sh ../.git/hooks/pre-commit.local
	@echo "pre-commit.local hook installed."
