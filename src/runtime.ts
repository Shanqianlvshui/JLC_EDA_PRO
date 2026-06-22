/**
 * Runtime accessor for the `eda` global.
 *
 * JLC EDA Pro injects `eda` as a global at plugin load time. The type is
 * declared globally by `@jlceda/pro-api-types` (line 21301: `const eda: EDA`),
 * so any source file can reference `eda` directly without importing it.
 *
 * This module re-exports `eda` so callers that prefer explicit imports still
 * have a single source of truth for the access path.
 */

export {};
