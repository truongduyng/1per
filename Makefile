BUMP ?= patch

.PHONY: dev prebuild build submit bump worker-dev worker-deploy worker-migrate worker-migrate-local

dev:
	cd app && bun run ios

prebuild:
	cd app && npx expo prebuild -p ios

build:
	cd app && bun run build

submit:
	cd app && bun run submit

bump:
	cd app && bun run bump-version $(BUMP)
	$(MAKE) build
	$(MAKE) submit

worker-dev:
	cd worker && bun run dev

worker-deploy:
	cd worker && bun run deploy

worker-migrate:
	cd worker && bun run db:migrate

worker-migrate-local:
	cd worker && bun run db:migrate:local
