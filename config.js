// Browser-safe settings only. Typesense credentials are read by server.mjs
// from .env and are never sent to the browser.
window.PARKLENS_CONFIG = {
  searchEndpoint: "/api/search"
};
