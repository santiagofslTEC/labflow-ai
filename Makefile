.PHONY: dev api web openapi migrate seed format lint typecheck check

# Start the API (port 8000) and the web app (port 3000) together. Ctrl+C stops both.
dev:
	@trap 'kill 0' INT TERM; \
	$(MAKE) api & $(MAKE) web & wait

api:
	cd api && uv run fastapi dev --port 8000

web:
	cd web && pnpm dev

# Refresh the API contract and the web types after changing a Pydantic model or route.
openapi:
	cd api && uv run python scripts/export_openapi.py
	cd web && pnpm gen:api

# Apply every pending database migration to DATABASE_URL (Railway runs this before each deploy).
migrate:
	cd api && uv run alembic upgrade head

# Load the sample experiment (replaces the previous copy). Refuses to run with ENV=prod.
seed:
	cd api && uv run python scripts/seed.py

# Format both apps in place.
format:
	cd api && uv run ruff format . && uv run ruff check --fix .
	cd web && pnpm format

lint:
	cd api && uv run ruff check .
	cd web && pnpm lint

typecheck:
	cd api && uv run pyright
	cd web && pnpm typecheck

# What CI runs (minus the web build): format check, lint and typecheck in both apps.
check:
	cd api && uv run ruff format --check . && uv run ruff check . && uv run pyright
	cd web && pnpm format:check && pnpm lint && pnpm typecheck
