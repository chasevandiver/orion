#!/usr/bin/env bash
# =============================================================================
# ORION Dev Environment Setup
# Run this once after cloning the repo: ./infra/scripts/dev-setup.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[orion]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# Check prerequisites
command -v node >/dev/null 2>&1 || error "Node.js 20+ is required"
command -v npm >/dev/null 2>&1 || error "npm is required"
command -v docker >/dev/null 2>&1 || error "Docker is required"

NODE_VERSION=$(node -e "process.exit(parseInt(process.version.slice(1)) < 20 ? 1 : 0)" 2>&1 || true)
if [[ $? -ne 0 ]]; then
  error "Node.js 20+ is required (found $(node --version))"
fi

log "Starting ORION dev environment setup..."

# Create .env.local from template if it doesn't exist
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  warn "Created .env.local from template — please fill in secrets before running"
else
  log ".env.local already exists, skipping"
fi

# Install dependencies
log "Installing npm dependencies..."
npm install

# Start infrastructure
log "Starting Docker services (Postgres, Redis, Inngest, MailHog)..."
docker compose -f infra/docker/docker-compose.yml up -d

# Wait for Postgres
log "Waiting for Postgres to be ready..."
until docker exec orion_postgres pg_isready -U orion -d orion_dev >/dev/null 2>&1; do
  sleep 1
done

# Run migrations
log "Running database migrations..."
npm run db:migrate --filter=@orion/db

# Seed database
log "Seeding database with dev fixtures..."
npm run db:seed --filter=@orion/db

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ORION dev environment ready! ⚡    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "  Next.js:    http://localhost:3000"
echo "  API:        http://localhost:3001"
echo "  Inngest:    http://localhost:8288"
echo "  MailHog:    http://localhost:8025"
echo "  DB Studio:  run 'npm run db:studio'"
echo ""
echo "  Dev login:  dev@acme.com / password123"
echo ""
echo "  Start dev:  npm run dev"
echo ""
