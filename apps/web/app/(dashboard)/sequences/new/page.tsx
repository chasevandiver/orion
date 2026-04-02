import { Metadata } from "next";
import { SequenceBuilder } from "../_components/sequence-builder";

export const metadata: Metadata = { title: "New Email Sequence" };

export default function NewSequencePage() {
  return <SequenceBuilder />;
}
