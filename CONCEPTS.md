# Concepts

The project is intentionally small so new CheeksCast features can be added cleanly.

- `src/app.ts` owns Express middleware and routes.
- `src/composition.ts` wires controllers, services, repositories, and logging.
- `src/auth` owns login, logout, registration, and user lookup.
- `src/controller`, `src/service`, and `src/repository` are blank website layers ready for
  articles, videos, draft boards, and other viewer features.
