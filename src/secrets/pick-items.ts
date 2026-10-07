// #AVE-0004, #AVE-0009: quick-pick items shared by the vault ID pickers (no vscode import).

export interface PickerItem {
  label: string;
  description: string;
}

/** Known IDs, then `extras`; the default ID is moved first so it is pre-selected. */
// #AVE-0004, #AVE-0009
export function pickerItems(
  ids: string[],
  defaultId: string | undefined,
  extras: string[],
): PickerItem[] {
  const items = [
    ...ids.map((id) => ({
      label: id,
      description: id === defaultId ? "(default)" : "",
    })),
    ...extras.map((label) => ({ label, description: "" })),
  ];
  return items.sort((a, b) => Number(b.description !== "") - Number(a.description !== ""));
}
