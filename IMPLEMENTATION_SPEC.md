# minimachines — Implementation Specification

# Engineering Stack Requirements

The website should be built using the **T3 Stack** and be production-ready for deployment on Vercel.

## Technology Stack

* Next.js (App Router)
* React
* TypeScript
* tRPC
* Drizzle ORM
* PostgreSQL
* Tailwind CSS
* shadcn/ui
* Lucide React
* Framer Motion
* Zod
* React Hook Form

## Database

Use **Drizzle ORM** configured for **PostgreSQL**.

Assume the production database will be a **Neon** database connected through Vercel after deployment.

Create the Drizzle configuration so only the connection string needs to be supplied through environment variables.

Environment variable:

```env
DATABASE_URL=
```

Include:

* Drizzle schema
* migrations
* seed script
* production-ready database configuration

## Authentication

Structure the project so authentication can be added later without major refactoring.

Do not implement authentication yet.

## Project Structure

Follow idiomatic T3 Stack organization.

Keep code modular with separate folders for:

* components
* app routes
* server
* db
* lib
* hooks
* types
* styles

Favor server components whenever possible.

Use client components only where interactivity is required.

## UI

Use **shadcn/ui** as the primary component library.

All components should either:

* come directly from shadcn/ui, or
* extend shadcn/ui primitives.

Avoid custom UI implementations when a shadcn component already exists.

Maintain consistent spacing, typography, hover states, focus rings, and accessibility.

The interface should feel similar in quality to:

* Vercel
* Linear
* Blacksmith
* Raycast

## Styling

Use:

* Tailwind CSS
* CSS variables for theming
* shadcn design tokens

Avoid inline styles.

## Forms

Use:

* React Hook Form
* Zod validation

for every interactive form.

## Email Capture

Create an "Early Access" signup form backed by Drizzle.

Schema:

```ts
waitlist {
  id
  email
  createdAt
}
```

Requirements:

* prevent duplicate emails
* validate email addresses
* optimistic submission
* success animation
* accessible error handling

## Code Quality

Generate production-quality code.

Requirements:

* strict TypeScript
* ESLint
* Prettier
* reusable components
* no unnecessary abstractions
* no duplicated logic
* accessible HTML
* SEO metadata
* responsive layout
* lazy loading where appropriate

## Deployment

The project should deploy directly to Vercel with minimal configuration.

Expected setup:

1. Push to GitHub.
2. Import into Vercel.
3. Connect a Neon PostgreSQL database.
4. Add `DATABASE_URL`.
5. Run Drizzle migrations.
6. Deploy successfully without additional code changes.

## Deliverable

Generate a polished, production-ready codebase rather than a prototype.

The repository should be organized, maintainable, and suitable for immediate development after cloning.
