# Infrastructure

This directory holds infrastructure-as-code and operational configuration for
OvozAI. In **Phase 1** local development runs entirely from the root
[`docker-compose.yml`](../docker-compose.yml) (PostgreSQL + Redis), so this
directory is intentionally mostly empty for now.

## Planned layout (later phases)

```
infrastructure/
├── docker/        # Production Dockerfiles for api / web / voice-worker / jobs-worker
├── livekit/       # LiveKit server config + SIP ingress rules (Phase 4+)
├── terraform/     # Cloud infra: network, DB, Redis, object storage, compute
├── k8s/           # Kubernetes manifests / Helm charts (Phase 5+)
└── monitoring/    # Observability: metrics, dashboards, alerts (Phase 7)
```

## Notes

- **Data residency:** per Uzbekistan's Law "On Personal Data" (No. ZRU-547),
  personal data of Uzbek citizens must be stored on infrastructure located in
  Uzbekistan. This constrains the choice of hosting region and AI-provider
  regions. See [`../docs/SECURITY.md`](../docs/SECURITY.md).
- **Secrets** are never stored here. Local dev uses `.env`; staging/prod use a
  managed secret store. See [`../docs/SECURITY.md`](../docs/SECURITY.md).
