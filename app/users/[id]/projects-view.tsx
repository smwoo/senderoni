import { OpenProjectList } from "@/components/journal";
import { SectionHeading } from "@/components/ui/typography";
import { getDb } from "@/db/client";
import { getOpenProjects, OPEN_PROJECT_PAGE_SIZE } from "@/db/queries";
import { formatCount } from "@/lib/format";

export async function ProjectsView({ ownerId }: { ownerId: string }) {
  const rows = await getOpenProjects(await getDb(), ownerId, ownerId, OPEN_PROJECT_PAGE_SIZE + 1);
  const hasMore = rows.length > OPEN_PROJECT_PAGE_SIZE;
  const projects = hasMore ? rows.slice(0, OPEN_PROJECT_PAGE_SIZE) : rows;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading>Projects</SectionHeading>
        <span className="text-sm text-muted">
          {hasMore
            ? `${OPEN_PROJECT_PAGE_SIZE}+ open projects`
            : formatCount(projects.length, "open project")}
        </span>
      </div>
      <OpenProjectList projects={projects} hasMore={hasMore} />
    </div>
  );
}
