# Future Work & Roadmap

**Document:** 12 — Future Improvements  
**Project:** DigiMitra City  
**Minimum Items:** 40+

---

## Short Term (0–3 months)

| # | Improvement | Rationale |
|---|-------------|-----------|
| 1 | Add `.env.example` files for api and ui-police | Reduce onboarding friction |
| 2 | Implement GitHub Actions CI with pytest | Automated quality gate |
| 3 | Add auth to camera CRUD endpoints | Security hardening |
| 4 | Set `ALLOW_ANY_LOGIN=false` in production compose overlay | Prevent dev auth bypass |
| 5 | Replace mock AI assistant with RAG over detections | Real operator value |
| 6 | Implement `POST /api/v1/search/text` | Complete legacy search path |
| 7 | Add Alembic database migrations | Safe schema evolution |
| 8 | Remove or consolidate legacy `ui-police/src/app/` tree | Reduce confusion |
| 9 | Add `LICENSE` file (MIT/Apache-2.0) | Open-source readiness |
| 10 | Add health check endpoints (`/health`, `/ready`) | Container orchestration |
| 11 | Add OpenAPI response examples | Better API docs |
| 12 | Screenshot assets for documentation | Complete user manual |

---

## Medium Term (3–6 months)

| # | Improvement | Rationale |
|---|-------------|-----------|
| 13 | Federate Cognito with API JWT via OIDC | Single sign-on |
| 14 | GPU inference path for live-detection-agent | Multi-camera scaling |
| 15 | Kubernetes Helm charts | Production orchestration |
| 16 | Prometheus metrics + Grafana dashboards | Observability |
| 17 | Automated MinIO lifecycle policies | Storage cost control |
| 18 | Recording retention scheduler | Compliance and capacity |
| 19 | Multi-worker ai-processor with Redis queue | Parallel indexing |
| 20 | Persist live alerts to PostgreSQL | Alert history and audit |
| 21 | Email/SMS notification on high-severity alerts | Operator escalation |
| 22 | Role-based UI (hide admin features from viewers) | UX security |
| 23 | Camera health monitoring with auto-reconnect | RTSP reliability |
| 24 | Detection export (CSV/JSON) | Investigation workflows |
| 25 | Bookmark/save search queries | Operator productivity |
| 26 | Video timeline scrubber with detection markers | Better playback UX |
| 27 | Docker Compose production overlay file | Separate dev/prod config |
| 28 | Integration tests with Testcontainers | Reliable CI |

---

## Long Term (6–12 months)

| # | Improvement | Rationale |
|---|-------------|-----------|
| 29 | Multi-tenant city deployment | SaaS model |
| 30 | Federated search across multiple Milvus clusters | City-wide scale |
| 31 | Edge device deployment (Jetson/Nano) | On-camera inference |
| 32 | Mobile operator app (React Native) | Field operations |
| 33 | Integration with dispatch/911 systems | Emergency response |
| 34 | Digital twin city visualization (3D map) | Advanced situational awareness |
| 35 | Automated incident report generation | Legal compliance |
| 36 | Blockchain evidence chain of custody | Tamper-proof audit trail |
| 37 | Multi-language dashboard (i18n) | Global deployment |
| 38 | SLA-based uptime monitoring | Enterprise contracts |

---

## Research Ideas

| # | Idea | Description |
|---|------|-------------|
| 39 | Video-language models (VLM) for search | Replace CLIP with GPT-4V/LLaVA for richer queries |
| 40 | Self-supervised anomaly detection | Detect unknown anomalies without labeled rules |
| 41 | Federated learning across city cameras | Privacy-preserving model improvement |
| 42 | Temporal action recognition | Detect "fighting", "falling", "loitering" |
| 43 | Cross-camera person re-identification | Track individuals across camera network |
| 44 | Scene graph generation | Structured understanding of urban scenes |
| 45 | Causal inference for traffic incidents | Predict incident propagation |
| 46 | Active learning for operator feedback | Improve models from user corrections |
| 47 | Compressed video search | Search without full decode |
| 48 | Zero-shot detection with open-vocabulary models | Detect objects beyond COCO classes |

---

## AI Improvements

| # | Improvement | Description |
|---|-------------|-------------|
| 49 | Upgrade to YOLOv8m/l for accuracy | Trade speed for precision |
| 50 | Custom fine-tuned model for Indian traffic | Domain-specific detection |
| 51 | Automatic license plate recognition (ALPR) | Vehicle identification |
| 52 | Pose estimation for crowd behavior | Fight/assault detection |
| 53 | Audio gunshot detection integration | Multi-modal alerts |
| 54 | Semantic segmentation for zone rules | Polygon-based restricted areas |
| 55 | Model versioning and A/B testing | Safe model rollout |
| 56 | ONNX/TensorRT optimization | 5–10× inference speedup |
| 57 | Batch inference for ai-processor | GPU utilization |
| 58 | Embedding model upgrade (SigLIP, E5-V) | Better semantic search |
| 59 | LLM-powered query understanding | "Show me what happened after the red car" |
| 60 | Automatic highlight reel generation | Summarize incident video |

---

## Cloud Improvements

| # | Improvement | Description |
|---|-------------|-------------|
| 61 | Migrate MinIO → AWS S3 | Managed object storage |
| 62 | PostgreSQL → Amazon RDS | Managed database |
| 63 | Milvus on EKS or Zilliz Cloud | Managed vector DB |
| 64 | CloudFront for video delivery | Global presigned CDN |
| 65 | AWS Lambda for thumbnail generation | Serverless processing |
| 66 | SQS/SNS for alert notifications | Managed messaging |
| 67 | AWS WAF for API protection | DDoS/attack mitigation |
| 68 | Cross-region disaster recovery | High availability |
| 69 | Cost optimization with Spot instances | GPU cost reduction |
| 70 | Infrastructure as Code (Terraform) | Reproducible deployments |

---

## Security Improvements

| # | Improvement | Description |
|---|-------------|-------------|
| 71 | WSS for WebSocket (TLS) | Encrypt live alert stream |
| 72 | JWT refresh token flow | Reduce token exposure |
| 73 | Rate limiting on API endpoints | Brute-force protection |
| 74 | Audit log for all admin actions | Compliance |
| 75 | Encrypt RTSP credentials at rest | Camera password security |
| 76 | RBAC middleware on all endpoints | Consistent authorization |
| 77 | Content Security Policy headers | XSS prevention |
| 78 | Penetration testing program | Regular security assessment |
| 79 | SOC 2 compliance preparation | Enterprise readiness |
| 80 | Data anonymization for exported evidence | Privacy protection |

---

## UI Improvements

| # | Improvement | Description |
|---|-------------|-------------|
| 81 | Dark/light theme toggle (extend next-themes) | Operator preference |
| 82 | Drag-and-drop camera wall layout | Customizable monitoring |
| 83 | Picture-in-picture for alert playback | Multi-tasking |
| 84 | Keyboard shortcuts for navigation | Power user efficiency |
| 85 | Real-time detection count widgets | Dashboard analytics |
| 86 | Alert sound notifications | Immediate attention |
| 87 | Filterable/sortable events table | Large dataset navigation |
| 88 | Camera grouping by zone/district | Organizational hierarchy |
| 89 | Onboarding tutorial/walkthrough | New operator training |
| 90 | Accessibility (WCAG 2.1 AA) | Inclusive design |
| 91 | Progressive Web App (PWA) | Offline-capable dashboard |
| 92 | Custom alert rule configuration UI | No env var editing |

---

## Summary

| Category | Count |
|----------|-------|
| Short Term | 12 |
| Medium Term | 16 |
| Long Term | 10 |
| Research Ideas | 10 |
| AI Improvements | 12 |
| Cloud Improvements | 10 |
| Security Improvements | 10 |
| UI Improvements | 12 |
| **Total** | **92** |

---

## Related Documents

- [05_SOFTWARE_DESIGN_DOCUMENT.md](./05_SOFTWARE_DESIGN_DOCUMENT.md)
- [04_SRS.md](./04_SRS.md)
- [11_DEPLOYMENT_GUIDE.md](./11_DEPLOYMENT_GUIDE.md)
