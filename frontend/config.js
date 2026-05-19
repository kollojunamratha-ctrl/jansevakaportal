(function initializeJanSevakConfig() {
  const DEPLOYED_BACKEND_URL = "https://jansevak-backend.onrender.com";

  function trimTrailingSlash(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function getBackendUrl() {
    if (typeof window.JANSEVAK_BACKEND_URL === "string" && window.JANSEVAK_BACKEND_URL.trim()) {
      return trimTrailingSlash(window.JANSEVAK_BACKEND_URL);
    }

    return DEPLOYED_BACKEND_URL;
  }

  function buildApiUrl(pathname) {
    if (!pathname) {
      return getBackendUrl();
    }

    if (/^https?:\/\//i.test(pathname)) {
      return pathname;
    }

    const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return `${getBackendUrl()}${normalizedPath}`;
  }

  window.JanSevakConfig = {
    API_URL: getBackendUrl(),
    apiBaseUrl: getBackendUrl(),
    backendUrl: getBackendUrl(),
    buildApiUrl
  };
})();
