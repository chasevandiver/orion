import { PipelineProgress } from "@/components/pipeline-progress";

interface Props {
  params: { goalId: string };
}

export const metadata = { title: "Running Pipeline" };

export default function PipelinePage({ params }: Props) {
  return (
    <div className="-m-6 h-[calc(100vh-56px)]">
      <PipelineProgress goalId={params.goalId} />
    </div>
  );
}
