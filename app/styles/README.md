# Global CSS ownership

`app/globals.css` is the single global entrypoint. It imports the numbered files in this directory in ascending order so the pre-split cascade remains unchanged. `postcss-import` expands those imports before Next.js creates CSS chunks, preserving the existing single production stylesheet.

Rules:

- Do not reorder the imports or move an existing rule between files as part of an unrelated change.
- Put component rules in the file that owns the component and keep its media/container queries with the base rule.
- Keep broad selectors and shared responsive overrides in their current numbered layer.
- Do not add cascade layers or route-specific lazy loading without a separate visual-compatibility review.
- Keep `postcss-import` first and retain Next.js's default PostCSS transforms in `postcss.config.js`; omitting either changes production output.
- Run the full test, lint, typecheck, production build, and visual matrix after changing shared tokens or broad selectors.

The import and PostCSS order are guarded by `lib/cssArchitecture.test.ts`. Numeric prefixes are part of the maintenance contract; they describe source order, not visual elevation.
