import { WORKFLOW_SECTIONS } from "../lib/ui/workflowLabels";

interface WorkflowNavigationProps {
  itemCount: number;
}

export function WorkflowNavigation({ itemCount }: WorkflowNavigationProps) {
  const sections = [
    WORKFLOW_SECTIONS.inputQueue,
    {
      ...WORKFLOW_SECTIONS.process,
      label: itemCount === 1 ? "一键去水印" : WORKFLOW_SECTIONS.process.label,
    },
    WORKFLOW_SECTIONS.watermarkSelection,
    WORKFLOW_SECTIONS.outputVideo,
  ];

  return (
    <nav className="intro__meta" aria-label="工作区模块导航">
      {sections.map((section) => (
        <a key={section.id} href={`#${section.id}`}>
          <span>{section.index}</span>{section.label}
        </a>
      ))}
    </nav>
  );
}
