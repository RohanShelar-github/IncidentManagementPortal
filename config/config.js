const apiHostname = window.location.hostname || 'localhost';

window.APP_CONFIG = {
  API_BASE_URL: `${window.location.protocol}//${apiHostname}:4000/api`,
  APP_NAME: "Incident Management Portal",
  VERSION: "1.0.0",
  ENABLE_BACKEND: true,  // Set to true to use backend API instead of local storage
  JWT_TOKEN_KEY: "incident_portal_token"
};
