import { defineConfig } from "orval";

export default defineConfig({
  bookwise: {
    input: {
      target: "../server/src/generated/swagger.json",
    },
    output: {
      mode: "tags-split",
      target: "./src/generated/api/bookwise.ts",
      schemas: "./src/generated/api/models",
      client: "react-query",
      httpClient: "fetch",
      clean: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: "./src/lib/api/api-fetch.ts",
          name: "apiFetch",
        },
        query: {
          signal: true,
        },
      },
    },
  },
});
