"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { SequenceBuilder, type SequenceData } from "../_components/sequence-builder";

interface DbSequence {
  id: string;
  name: string;
  description?: string | null;
  triggerType: string;
  status: string;
  steps: {
    id: string;
    stepNumber: number;
    delayDays: number;
    subject: string;
    contentText: string;
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}

interface Props {
  sequence: DbSequence;
}

export function SequenceEditClient({ sequence }: Props) {
  const router = useRouter();
  const toast = useAppToast();

  const handleDuplicate = async () => {
    try {
      // Create a new draft with the same data
      const res = await api.post<{ data: { id: string } }>("/email-sequences", {
        name: `${sequence.name} (copy)`,
        description: sequence.description,
        triggerType: sequence.triggerType,
        status: "draft",
      });
      const newId = res.data.id;
      // Copy steps
      for (const step of sequence.steps) {
        await api.post(`/email-sequences/${newId}/steps`, {
          stepNumber: step.stepNumber,
          delayDays: step.delayDays,
          subject: step.subject,
          contentText: step.contentText,
        });
      }
      toast.success("Sequence duplicated", "Opening the copy…");
      router.push(`/sequences/${newId}`);
    } catch (err: unknown) {
      toast.error("Duplicate failed", (err as Error).message);
    }
  };

  const initialData: SequenceData = {
    id: sequence.id,
    name: sequence.name,
    ...(sequence.description !== undefined ? { description: sequence.description } : {}),
    triggerType: sequence.triggerType,
    status: sequence.status,
    steps: sequence.steps.map((s) => ({
      id: s.id,
      stepNumber: s.stepNumber,
      delayDays: s.delayDays,
      subject: s.subject,
      contentText: s.contentText,
    })),
  };

  return (
    <SequenceBuilder
      initialData={initialData}
      onDuplicate={handleDuplicate}
    />
  );
}
