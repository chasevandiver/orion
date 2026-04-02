import { serverApi } from "@/lib/server-api";
import { CalendarView } from "@/app/(dashboard)/calendar/calendar-view";

export const metadata = { title: "Content Calendar" };

export default async function CalendarPage() {
  let orgTimezone = "America/Chicago";
  try {
    const res = await serverApi.get<{ data: { timezone?: string } }>("/settings/org");
    orgTimezone = res.data.timezone ?? "America/Chicago";
  } catch {
    // fall back to default
  }

  return <CalendarView orgTimezone={orgTimezone} />;
}
