# Deployment Guide

## Overview
LaunchSin uses a GitOps-style deployment workflow via GitHub Actions and Kubernetes Kustomize.

## Environments

| Environment | Branch | URL | Sync Policy |
|-------------|--------|-----|-------------|
| **Staging** | `staging` | `api-staging.launchsin.com` | Auto-deploy on push |
| **Production** | `main` | `api.launchsin.com` | Manual approval (Workflow Dispatch) |

## CI/CD Pipeline
Defined in `.github/workflows/deploy-staging.yml`.

### Steps:
1. **Build**: Docker images are built for `server` and `workers`.
2. **Push**: Images pushed to GHCR (`ghcr.io/nicoolasmr/launchsin/...`).
3. **Deploy**: `kubectl kustomize` runs on `k8s/overlays/staging` with the new image SHA.

## Secrets Management
Secrets are NOT stored in Git.
To update secrets in Staging:
1. Update AWS/GCP Secret Manager (if sync is enabled).
2. Or manually apply:
   ```bash
   kubectl create secret generic launchsin-secrets \
     --from-literal=internal-api-key=... \
     --namespace staging \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

## Monitoring
- **Prometheus**: Scrapes `/metrics` on port 80.
- **Grafana**: Dashboards located in `monitoring/grafana/`.
  - Import `launchsin-overview.json` for health metrics.

## Rollback
To rollback Staging:
1. Revert the commit on `staging` branch.
2. Push. The pipeline will redeploy the previous version.
