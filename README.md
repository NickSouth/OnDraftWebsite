# CheeksCast Website

TypeScript website for CheeksCast (Ryan McWalter and Aleks Ryabinkin).

The app currently includes:

- Express, EJS layouts, and static CSS,
- login, logout, and in-memory registration,
- a protected `/website` shell,
- empty website controller, service, and repository layers wired through composition.

## Run

```sh
npm install
npm run build
npm run dev
```

Demo users:

- `ryanmcwalter@cheekscast.test` / `password123`
- `bob@website.test` / `password123`

## Tests

```sh
npm test
```
