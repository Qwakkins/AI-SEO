/**
 * The public deployment is a read-only showcase: anyone can browse the
 * dashboard and reports, but nothing can add businesses, edit facts or run
 * scans (which spend AI API credits) unless writes are switched on.
 *
 * Writes are OFF unless NEXT_PUBLIC_ALLOW_WRITES is exactly "true". Set it
 * in .env.local when running the app yourself; leave it unset in production.
 * The weekly cron scan is separate and authenticates with CRON_SECRET.
 */
export function writesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_WRITES === "true";
}

export function readOnlyResponse(): Response {
  return Response.json(
    {
      error:
        "This deployment is a read-only demo. Run the app locally to add businesses or scan.",
    },
    { status: 403 },
  );
}
