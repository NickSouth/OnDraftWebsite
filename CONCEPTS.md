# Concepts

The project is intentionally small so new OnDraft features can be added cleanly.

- `src/app.ts` owns Express middleware and routes.
- `src/composition.ts` wires controllers, services, repositories, and logging.
- `src/auth` owns login, logout, registration, and user lookup.
- `src/controller`, `src/service`, and `src/repository` are OnDraft layers ready for
  articles, videos, draft boards, and other viewer features.
