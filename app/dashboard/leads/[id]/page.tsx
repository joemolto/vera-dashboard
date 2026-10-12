import { redirect } from "next/navigation";

export default async function LeadRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/prospects/${id}`);
}
