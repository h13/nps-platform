.PHONY: init plan apply output secrets fmt validate lint security check

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
