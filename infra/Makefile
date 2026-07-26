.PHONY: init plan apply output secrets fmt validate lint security shellcheck check hooks

init:
	tofu init

plan:
	tofu plan

apply:
	tofu apply

output:
	tofu output

secrets:
	./scripts/push-secrets.sh

fmt:
	tofu fmt -check -recursive

validate:
	tofu validate

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
