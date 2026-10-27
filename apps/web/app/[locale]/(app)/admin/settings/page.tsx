import { redirect } from "next/navigation";

/**
 * /admin/settings has no content of its own — redirect to the SLA tab.
 */
export default async function SettingsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin/settings/sla`);
}
