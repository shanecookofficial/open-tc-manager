import { ProjectSwitcher } from "@/components/projects/project-switcher";

type AppHeaderProps = {
  currentPrefix?: string;
};

export function AppHeader({ currentPrefix }: AppHeaderProps) {
  return (
    <header className="flex h-14 items-center gap-4 border-b px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          OpenTCM — Open Test Case Manager
        </p>
      </div>
      <ProjectSwitcher currentPrefix={currentPrefix} />
    </header>
  );
}
