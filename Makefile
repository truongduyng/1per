BUMP ?= patch

.PHONY: dev prebuild build submit bump worker-dev worker-deploy worker-migrate worker-migrate-local

dev:
	cd app && npm run ios

prebuild:
	cd app && npx expo prebuild -p ios

build:
	cd app && npm run build

submit:
	cd app && npm run submit

bump:
	cd app && npm run bump-version $(BUMP)
	$(MAKE) build
	$(MAKE) submit

worker-dev:
	cd worker && npm run dev

worker-deploy:
	cd worker && npm run deploy

worker-migrate:
	cd worker && npm run db:migrate

worker-migrate-local:
	cd worker && npm run db:migrate:local
