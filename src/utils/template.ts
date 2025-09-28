export type TemplateContext = Record<string, string | number | undefined | null>;

function padNumber(value: number, width: number): string {
  const s = String(Math.abs(value));
  const sign = value < 0 ? "-" : "";
  return sign + s.padStart(width, "0");
}

/**
 * Renders a template with placeholders like {title}, {year}, {season:02}.
 * Optional groups in [square brackets] are omitted if all placeholders inside resolve to empty/undefined.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  if (!template) return "";

  // First, process bracketed optional groups.
  const withGroups = template.replace(/\[(.+?)\]/g, (match, group) => {
    // Resolve placeholders within the group to check if any have values
    const resolved = group.replace(/\{([a-zA-Z0-9_]+)(?::(\d+))?\}/g, (_m, key, fmt) => {
      const raw = context[key];
      if (raw == null || raw === "") return "";
      if (typeof raw === "number" && fmt) return padNumber(raw, parseInt(fmt, 10));
      return String(raw);
    });
    // If the resolved group is empty or whitespace/punctuation only, drop the whole group
    const hasContent = /[a-zA-Z0-9]/.test(resolved);
    return hasContent ? resolved : "";
  });

  // Then, replace simple placeholders.
  const replaced = withGroups.replace(/\{([a-zA-Z0-9_]+)(?::(\d+))?\}/g, (m, key, fmt) => {
    const raw = context[key];
    if (raw == null || raw === "") return "";
    if (typeof raw === "number" && fmt) return padNumber(raw, parseInt(fmt, 10));
    return String(raw);
  });

  // Collapse duplicate slashes that may result from empty groups
  return replaced.replace(/\/+/, "/").replace(/\s{2,}/g, " ").trim();
}



