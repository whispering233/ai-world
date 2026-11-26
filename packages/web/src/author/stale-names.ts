/**
 * 作者改了 `places` / `names` / `items` 的显示名之后，正文里可能还留着旧称呼。
 * 这里只**报位置**，不改任何文本：改名的影响面只有读过那几个人读字符串的人知道。
 *
 * 编辑前的快照只在本次表单会话里存在，所以“上次打开表单时改的名”查不到——重开表单后没有旧名可比。
 */

/** 作者壳自己声明的最小内容包：只列会参与显示名比较与正文扫描的字段。 */
export interface NamePack {
  title?: string
  opening?: string
  scene?: string
  canon?: string[]
  characters?: NamePackCharacter[]
  world?: { places?: Record<string, string> }
  names?: Record<string, string>
  items?: Record<string, string>
}

export interface NamePackCharacter {
  id: string
  core?: string
  voice?: string
  beliefs?: Record<string, string>
  drives?: { id?: string; text?: string }[]
}

export type DisplayNameKind = 'place' | 'name' | 'item'

/** 一处改名留下的残留：`fields` 是仍出现旧名的正文字段的人读标签，按正文顺序。 */
export interface StaleDisplayName {
  kind: DisplayNameKind
  id: string
  from: string
  to: string
  fields: string[]
}

/** 三类显示名在包里的位置；扫描顺序也就是返回值顺序。 */
const DISPLAY_NAME_TABLES: { kind: DisplayNameKind; pick: (pack: NamePack) => Record<string, string> | undefined }[] = [
  { kind: 'place', pick: (pack) => pack.world?.places },
  { kind: 'name', pick: (pack) => pack.names },
  { kind: 'item', pick: (pack) => pack.items },
]

/**
 * `before` 是编辑前快照、`after` 是当前表单值；只返回**仍被正文引用旧名**的那些改名。
 * 没有残留的改名不返回——这是提示，不是改名日志。
 */
export function staleDisplayNames(before: NamePack, after: NamePack): StaleDisplayName[] {
  const texts = bodyTexts(after)
  const stale: StaleDisplayName[] = []
  for (const table of DISPLAY_NAME_TABLES) {
    const oldNames = table.pick(before) ?? {}
    const newNames = table.pick(after) ?? {}
    for (const [id, newName] of Object.entries(newNames)) {
      const oldName = oldNames[id]
      if (oldName === undefined) continue
      const from = oldName.trim()
      const to = newName.trim()
      // 只处理真的改了名的：新增键没有旧名，清空显示名与原名相同都不算
      if (from === '' || to === '' || from === to) continue
      const fields = texts.filter((entry) => stillMentions(entry.text, from, to)).map((entry) => entry.label)
      if (fields.length > 0) stale.push({ kind: table.kind, id, from, to, fields })
    }
  }
  return stale
}

/**
 * 先把新名整段删掉再找旧名：“安”→“安妮”之后，正文里的“安妮”本身不是残留。
 */
function stillMentions(text: string, from: string, to: string): boolean {
  return text.split(to).join('').includes(from)
}

/** 正文里所有会被玩家读到的字段，按表单里的顺序编号，标签直接给人看。 */
function bodyTexts(pack: NamePack): { label: string; text: string }[] {
  const texts: { label: string; text: string }[] = []
  if (pack.title !== undefined) texts.push({ label: 'title', text: pack.title })
  if (pack.opening !== undefined) texts.push({ label: 'opening', text: pack.opening })
  if (pack.scene !== undefined) texts.push({ label: 'scene', text: pack.scene })
  for (const [index, line] of (pack.canon ?? []).entries()) {
    texts.push({ label: `canon 第 ${index + 1} 条`, text: line })
  }
  for (const character of pack.characters ?? []) {
    if (character.core !== undefined) texts.push({ label: `${character.id} 的 core`, text: character.core })
    if (character.voice !== undefined) texts.push({ label: `${character.id} 的 voice`, text: character.voice })
    for (const [key, value] of Object.entries(character.beliefs ?? {})) {
      texts.push({ label: `${character.id} 的信念 ${key}`, text: value })
    }
    for (const drive of character.drives ?? []) {
      if (drive.text === undefined) continue
      texts.push({ label: drive.id === undefined ? `${character.id} 的 drives` : `${character.id} 的 ${drive.id}`, text: drive.text })
    }
  }
  return texts
}