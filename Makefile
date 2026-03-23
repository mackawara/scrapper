IMAGE   ?= mackawara/scrapper
TAG     ?= latest
PLATFORM_ARM  = linux/arm64
PLATFORM_AMD  = linux/amd64
PLATFORM_MULTI = linux/arm64,linux/amd64

# ── Local helpers ─────────────────────────────────────────────────────────────

stop:
	docker stop scrapper || true
	docker rm scrapper || true

clean: stop
	docker rmi scrapper || true

prune: stop
	docker system prune -a

# ── Build for Oracle ARM (linux/arm64) ────────────────────────────────────────

build: stop
	docker buildx build --platform $(PLATFORM_ARM) --load -t scrapper .

build-no-cache: stop clean
	docker buildx build --platform $(PLATFORM_ARM) --load --no-cache -t scrapper .

# ── Build for local x86 dev machine ───────────────────────────────────────────

build-amd: stop
	docker buildx build --platform $(PLATFORM_AMD) --load -t scrapper .

# ── Run locally ───────────────────────────────────────────────────────────────

run: stop
	docker run --rm --name scrapper -p 3000:3000 --env-file .env scrapper:latest

run-it: stop
	docker run --rm -it scrapper sh

# ── Push to Docker Hub ────────────────────────────────────────────────────────

# Push ARM64 image (for Oracle VM deployment)
push-arm:
	docker buildx build --platform $(PLATFORM_ARM) \
		--push -t $(IMAGE):$(TAG) -t $(IMAGE):arm64 .

# Push multi-platform image (ARM64 + AMD64)
push-multi:
	docker buildx build --platform $(PLATFORM_MULTI) \
		--push -t $(IMAGE):$(TAG) .

# Legacy alias
push: push-arm
