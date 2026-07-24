export type ShepherdingRuntimeEnv = {
  APP_BASE_URL?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
  ENCRYPTION_SECRET?: string;
};

export function getRuntimeEnv(): ShepherdingRuntimeEnv {
  return {
    APP_BASE_URL: process.env.APP_BASE_URL?.trim(),
    BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    ENCRYPTION_SECRET: process.env.ENCRYPTION_SECRET,
  };
}

export function appOrigin(request: Request) {
  const configured = getRuntimeEnv().APP_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

export function secureCookieAttribute() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}
