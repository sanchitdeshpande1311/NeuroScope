// "/" is the public landing page, served by the landing-page service through the rewrite in next.config.ts.
// This page is only reached when no landing service is configured (NEUROSCOPE_LANDING_ORIGIN unset): it then
// opens the workspace directly, keeping old "/?run=<id>" links working.
import { redirect } from 'next/navigation';

export default async function Root({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  redirect(run && /^[0-9a-f]{32}$/.test(run) ? `/runs/${run}` : '/upload');
}
