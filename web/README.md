# BookWise AI web application

Next.js 16, React 19, TypeScript, and Tailwind CSS frontend for the BookWise AI appointment-booking prototype.

The primary project documentation, including the complete architecture, booking workflow, database design, deployment instructions, tradeoffs, assumptions, and limitations, is in the [root README](../README.md).

## Architecture

- App Router pages under `src/app` compose feature-level components and route loading/error states.
- Auth context manages the current user and chooses session or local browser storage for the bearer token.
- TanStack Query manages server state, caching, mutations, cursor pagination, and three-second chat polling.
- Orval generates typed React Query hooks and models from the backend OpenAPI specification.
- Feature folders contain booking, authentication, appointment, conversation, and profile UI.
- Shared components and CSS design tokens provide consistent colors, typography, loading states, and interactions.

The application uses the Inter font through `next/font` and reusable design tokens defined in `src/app/globals.css`.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_API_BASE_URL` to the backend API base URL.
3. Install the locked dependencies with `npm ci`.
4. Start the frontend with `npm run dev`.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

The frontend runs at [http://localhost:3000](http://localhost:3000). For local development, the backend defaults to `http://localhost:4000/api`.

## Environment variable

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Public backend URL including the `/api` base path. |

Never place private credentials in a `NEXT_PUBLIC_*` variable because Next.js exposes it to the browser.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the Next.js development server. |
| `npm run build` | Create and validate the production build. |
| `npm start` | Run the compiled production application. |
| `npm run lint` | Run ESLint. |
| `npx tsc --noEmit` | Check TypeScript without emitting files. |
| `npm run api:generate` | Regenerate the OpenAPI specification and Orval API client. |

## API client generation

The backend tsoa controllers and DTOs are the API contract source. After changing that contract, run:

```bash
npm run api:generate
```

This command regenerates `server/src/generated/swagger.json` and the hooks and models under `src/generated/api`. Generated API files should not be edited manually.

## Deployment

Deploy this directory as the Vercel project root and configure `NEXT_PUBLIC_API_BASE_URL` with the deployed Render API URL, including `/api`. Configure the backend `WEB_ORIGIN` with the exact Vercel origin.
