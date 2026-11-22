import { useEffect, useState } from 'react'
import { ApiError, fetchAuthorContent, saveContent } from '../api.ts'
import { Banner } from '../ui/Banner.tsx'
import { Button } from '../ui/Button.tsx'
import { Collapsible } from '../ui/Collapsible.tsx'
import { EditableList } from '../ui/EditableList.tsx'
import { Field } from '../ui/Field.tsx'
import { NumberField } from '../ui/NumberField.tsx'
import { TextField } from '../ui/TextField.tsx'

interface EditableDrive {
  id: string
  text: string
  heat: number
}

interface EditableCharacter {
  id: string
  core?: string
  voice?: string
  drives: EditableDrive[]
  beliefs: Record<string, string>
}

/**
 * 作者壳自己声明的最小内容包类型：web 拿不到 `@ai-world/core`，也不能为此加依赖。
 * 只列出会动的字段；没声明的字段靠展开复制原样回到提交的 JSON 里。
 */
export interface EditablePack {
  title: string
  world: unknown
  characters: EditableCharacter[]
  canon: string[]
  player: string
  names: Record<string, string>
  items: Record<string, string>
  aliases?: Record<string, string[]>
}

export interface ContentEditorProps {
  onSaved: () => void
}

/** 内容表单：只编辑作者字段，世界结构只读；保存是显式按钮，不做失焦保存。 */
export function ContentEditor({ onSaved }: ContentEditorProps) {
  const [pack, setPack] = useState<EditablePack | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetchAuthorContent().then(
      (data) => {
        if (!alive) return
        try {
          setPack(JSON.parse(data.text) as EditablePack)
        } catch {
          setErrors(['磁盘上的内容包不是合法 JSON'])
        }
      },
      () => {
        if (alive) setErrors(['读不到内容包'])
      },
    )
    return () => {
      alive = false
    }
  }, [])

  if (pack === null) {
    return (
      <div className="p-4">
        {errors.length === 0 ? <p className="text-meta text-ink-soft">正在读内容包…</p> : <Banner tone="alert">{errors.join('；')}</Banner>}
      </div>
    )
  }

  function updateCharacter(index: number, patch: Partial<EditableCharacter>): void {
    if (pack === null) return
    setPack({ ...pack, characters: pack.characters.map((item, i) => (i === index ? { ...item, ...patch } : item)) })
  }

  function updateDrive(characterIndex: number, driveIndex: number, patch: Partial<EditableDrive>): void {
    const character = pack?.characters[characterIndex]
    if (character === undefined) return
    updateCharacter(characterIndex, {
      drives: character.drives.map((drive, i) => (i === driveIndex ? { ...drive, ...patch } : drive)),
    })
  }

  function updateCanon(index: number, line: string): void {
    if (pack === null) return
    setPack({ ...pack, canon: pack.canon.map((item, i) => (i === index ? line : item)) })
  }

  async function save(): Promise<void> {
    setSaving(true)
    setErrors([])
    try {
      await saveContent(JSON.stringify(pack, null, 2))
      onSaved()
    } catch (error) {
      setErrors(error instanceof ApiError && error.errors.length > 0 ? error.errors : [(error as Error).message])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex max-h-[80dvh] flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {errors.length > 0 && (
          <Banner tone="alert" className="mb-4">
            {errors.join('；')}
          </Banner>
        )}

        <section className="mb-8">
          <h3 className="mb-2 text-meta text-ink-soft">人物</h3>
          {pack.characters.map((character, characterIndex) => (
            <fieldset key={character.id} className="mb-6 flex flex-col gap-3 border border-rule p-3">
              <legend className="px-1 text-meta text-ink-soft">{character.id}</legend>
              <Field label="core" htmlFor={`${character.id}-core`}>
                <TextField
                  id={`${character.id}-core`}
                  multiline
                  rows={6}
                  value={character.core ?? ''}
                  onValueChange={(core) => updateCharacter(characterIndex, { core })}
                />
              </Field>
              <Field label="voice" htmlFor={`${character.id}-voice`}>
                <TextField
                  id={`${character.id}-voice`}
                  multiline
                  rows={2}
                  value={character.voice ?? ''}
                  onValueChange={(voice) => updateCharacter(characterIndex, { voice })}
                />
              </Field>

              <div className="flex flex-col gap-2">
                <h4 className="text-meta text-ink-soft">drives</h4>
                {character.drives.map((drive, driveIndex) => (
                  <div key={drive.id} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Field label={drive.id}>
                        <TextField
                          value={drive.text}
                          ariaLabel={`${character.id} 的 ${drive.id} 文本`}
                          onValueChange={(text) => updateDrive(characterIndex, driveIndex, { text })}
                        />
                      </Field>
                    </div>
                    <Field label="heat">
                      <NumberField
                        value={drive.heat}
                        min={0}
                        max={1}
                        step={0.05}
                        onValueChange={(heat) => updateDrive(characterIndex, driveIndex, { heat })}
                      />
                    </Field>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <h4 className="text-meta text-ink-soft">beliefs</h4>
                {Object.entries(character.beliefs).length === 0 ? (
                  <p className="text-meta text-ink-soft">还没有信念。</p>
                ) : (
                  Object.entries(character.beliefs).map(([key, value]) => (
                    <Field key={key} label={key}>
                      <TextField
                        value={value}
                        ariaLabel={`${character.id} 的信念 ${key}`}
                        onValueChange={(next) =>
                          updateCharacter(characterIndex, { beliefs: { ...character.beliefs, [key]: next } })
                        }
                      />
                    </Field>
                  ))
                )}
              </div>
            </fieldset>
          ))}
        </section>

        <section className="mb-8 flex flex-col gap-2">
          <h3 className="text-meta text-ink-soft">canon</h3>
          <EditableList
            items={pack.canon}
            ariaLabel="canon"
            addLabel="一条 canon"
            newItem={() => ''}
            onItemsChange={(canon) => setPack({ ...pack, canon })}
            renderItem={(line, index) => (
              <TextField
                multiline
                rows={2}
                value={line}
                ariaLabel={`canon 第 ${index + 1} 条`}
                onValueChange={(next) => updateCanon(index, next)}
              />
            )}
          />
        </section>

        <Collapsible summary="世界结构（只读）">
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-meta text-ink-soft">
            {JSON.stringify(
              { title: pack.title, world: pack.world, player: pack.player, names: pack.names, items: pack.items, aliases: pack.aliases },
              null,
              2,
            )}
          </pre>
        </Collapsible>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-rule p-3">
        <p className="text-meta text-ink-soft">保存只写 content/，本局不变；新内容要开新局才生效。</p>
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </footer>
    </div>
  )
}
