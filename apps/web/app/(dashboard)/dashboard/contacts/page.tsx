import { serverApi } from "@/lib/server-api";
import { ContactsTable } from "@/app/(dashboard)/contacts/contacts-table";

export const metadata = { title: "CRM" };

interface Contact {
  id: string;
  email: string;
  name?: string;
  company?: string;
  title?: string;
  status: string;
  leadScore: number;
  sourceChannel?: string;
  createdAt: string;
}

export default async function ContactsPage() {
  let contacts: Contact[] = [];
  try {
    const res = await serverApi.get<{ data: Contact[] }>("/contacts");
    contacts = res.data;
  } catch {
    // Empty state
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">CRM</h1>
        <p className="text-sm text-muted-foreground">
          Contacts captured from campaigns, forms, and webhooks.
        </p>
      </div>
      <ContactsTable initialContacts={contacts} />
    </div>
  );
}
