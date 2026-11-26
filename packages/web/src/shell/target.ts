/** 目标只在仍在场的显示名里有效；离场就回到“自动”。 */
export function effectiveTarget(target: string | null, here: readonly string[]): string | null {
  return target !== null && here.includes(target) ? target : null
}
