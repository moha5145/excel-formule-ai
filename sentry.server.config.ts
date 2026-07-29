import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "",
  tracesSampleRate: 0.05,
  environment: process.env.NODE_ENV || "development",
  enabled: !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers["x-api-key"];
      delete event.request.headers["authorization"];
    }
    return event;
  },
});
