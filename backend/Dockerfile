# --- Stage 1: build frontend ---
FROM node:20-alpine AS frontend
WORKDIR /src
COPY frontend ./frontend
COPY backend ./backend
WORKDIR /src/frontend
RUN npm install && npm run build

# --- Stage 2: backend ---
FROM python:3.11-slim AS backend
WORKDIR /app
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir .
COPY backend/app ./app
# bring in the built static bundle
COPY --from=frontend /src/backend/app/static ./app/static
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
