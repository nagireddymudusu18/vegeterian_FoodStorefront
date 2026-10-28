# Helper commands. Needs GNU make (Windows: `choco install make`, `scoop install make`, or run from Git Bash).
# Java 21 + Maven must be on PATH for the Java targets; Node 22 for the storefront; Docker for `up`.

SERVICES := identity-service catalog-service order-service payment-service fleet-service
COMPOSE  := docker compose -f deploy/compose/docker-compose.yml --env-file deploy/compose/.env

.DEFAULT_GOAL := help

.PHONY: help setup keys build test verify lint up up-detached down logs clean storefront-dev $(SERVICES)

help: ## List the available targets
	@echo Targets:
	@echo   setup           Generate dev secrets (deploy/compose/.env) and install storefront dependencies
	@echo   keys            Generate deploy/compose/.env only
	@echo   build           Compile every service (skip tests) and build the storefront
	@echo   test            Run unit tests of every service and the storefront
	@echo   verify          Run unit + integration tests (needs Docker for Testcontainers)
	@echo   lint            Lint the storefront
	@echo   up              Start the whole stack in the foreground (http://localhost:8080)
	@echo   up-detached     Start the whole stack in the background
	@echo   down            Stop the stack
	@echo   logs            Follow the stack logs
	@echo   storefront-dev  Run the Next.js dev server on :3000
	@echo   clean           Remove build output
	@echo   ^<service^>       Build one service, e.g. make order-service

setup: keys
	npm --prefix storefront ci

keys:
	node deploy/scripts/gen-keys.mjs

build:
	$(foreach s,$(SERVICES),mvn -B -q -f services/$(s)/pom.xml -DskipTests package &&) echo services built
	npm --prefix storefront run build

$(SERVICES):
	mvn -B -f services/$@/pom.xml -DskipTests package

test:
	$(foreach s,$(SERVICES),mvn -B -f services/$(s)/pom.xml test &&) echo service unit tests passed
	npm --prefix storefront test

verify:
	$(foreach s,$(SERVICES),mvn -B -f services/$(s)/pom.xml verify &&) echo service verification passed
	npm --prefix storefront test

lint:
	npm --prefix storefront run lint

up:
	$(COMPOSE) up --build

up-detached:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

storefront-dev:
	npm --prefix storefront run dev

clean:
	$(foreach s,$(SERVICES),mvn -B -q -f services/$(s)/pom.xml clean &&) echo cleaned
