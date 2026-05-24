# OnDraft

TypeScript app for OnDraft, a beer themed NFL media site.
This app was entirely built by Nick Southey for his friends and partners Ryan Mcwalter and Aleks Ryabinkin.
The app is a content management and content hosting site.

The app currently includes:
- Page for articles
- Page for videos
- Page for a draft board
- Page for community takes
- User account handling
- Admin accounts for managing content
- Generally good practice layers and programming with dependency injection and boundaries

## Dev Stack

- **Languages:** TypeScript (compiled to Node)
- **Runtime:** Node.js (recommended LTS)
- **Web:** Express + EJS templates, enhanced with HTMX and Alpine.js for interactivity
- **Styling:** Tailwind CSS (see src/static/tailwind.input.css)
- **Database:** Prisma ORM (migrations in `prisma/`); uses SQLite for local/dev, Postgres supported
- **Testing:** Jest + Supertest (tests in `test/`)
- **Build & Tooling:** TypeScript (`tsc`), Tailwind CLI, Prisma, `ts-node` for scripts
- **Programming AI:** Codex and CoPilot across the full stack with good practice prompting

## Run

Replace example .env with an actual .env and include necessary API keys.
Select either prisma or in-memory mode, for prisma:
```sh
npx primsa generate
npx prisma migrate dev
```
Then run:
```sh
npm install
npm run build
npm run dev
```

## Tests

```sh
npm test
```

To contact us about OnDraft related questions like business inquirees or website support:
support@ondraftfootball.com

To contact the developer of this website directly for website construction requests or employment offers:
nickrsouthey@gmail.com
