"use client";

import { Button, SearchField } from "@heroui/react";
import { useState } from "react";

export function ClimberSearchForm({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  return (
    <form action="/" className="flex items-center gap-2">
      <input type="hidden" name="mode" value="climber" />
      <SearchField
        aria-label="Climber name"
        value={value}
        onChange={setValue}
        className="w-full sm:max-w-sm"
      >
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input name="name" maxLength={100} placeholder="Search climbers by name…" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <Button type="submit" size="sm">
        Search
      </Button>
    </form>
  );
}
