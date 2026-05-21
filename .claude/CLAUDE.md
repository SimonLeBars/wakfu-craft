
You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## SCSS Mixins

- Before writing a new SCSS block, check `src/styles/_mixins.scss` for an existing mixin that fits.
- Use `@include input-base($bg)` for all text/number/select inputs; pass `var(--bg-surface)` when the field sits on a surface background.
- Use `@include recipe-tab($padding, $font-size)` for any pill-style recipe/tab button.
- Use `@include level-warn` for any orange "level too low" warning box, then add only the layout overrides (margin, padding, font-size) outside the mixin.
- When the same CSS pattern appears in two or more components, extract it as a parameterized mixin in `_mixins.scss` rather than duplicating it.

## Database Migrations

- Migration files live in `electron/database/migrations/` and are named `vN.sql`.
- **Do not create a new `vN+1.sql` for uncommitted changes.** As long as the current migration file is not yet committed, edit it in place.
- When updating an uncommitted migration file, also fix the live database manually so it stays in sync:
  1. Revert the changes the previous version of the script applied (e.g. `ALTER TABLE … DROP COLUMN`).
  2. Decrement the `schema_version` in the `settings` table back to `N-1`.
  3. Restart the app so the updated `vN.sql` runs cleanly from scratch.
- Only bump to a new `vN+1.sql` once `vN.sql` is part of a commit.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## Before Committing

Before creating a commit, run the following on staged files:

```powershell
# Prettier — format staged files (adjust extensions as needed)
git diff --name-only --cached | Where-Object { $_ -match '\.(ts|html|scss|json)$' } | ForEach-Object { npx prettier --write $_ }

# ESLint — lint staged TS/HTML files
git diff --name-only --cached | Where-Object { $_ -match '\.(ts|html)$' } | ForEach-Object { npx eslint --fix $_ }
```

Re-stage any files modified by these commands before committing.
