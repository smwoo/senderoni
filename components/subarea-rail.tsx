import { AppLink } from "@/components/ui/app-link";
import { areaHref } from "@/lib/slug";

/** The sub-area index beside the climb table: a plain navigation rail —
 * each row opens that sub-area's page. Sticky with its own scroll on
 * desktop, so a long index never pushes the table away. */
export function SubareaRail({ subareas }: { subareas: { id: number; name: string }[] }) {
  return (
    <nav
      aria-label="Sub-areas"
      className="lg:sticky lg:top-6 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1"
    >
      <ul className="flex flex-col">
        {subareas.map((subarea) => (
          <li key={subarea.id}>
            <AppLink
              href={areaHref(subarea.id, subarea.name)}
              className="block min-w-0 truncate rounded-inset px-2 py-1.5 text-sm text-foreground no-underline transition-colors hover:bg-surface-secondary/60"
            >
              {subarea.name}
            </AppLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
