.PHONY: dev api web openapi

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
