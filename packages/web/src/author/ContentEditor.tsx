import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Collapse, Input, InputNumber } from 'antd'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, fetchAuthorContent, saveContent } from '../api.ts'

/** 表单里"标签在上、控件在下"只有这一种排法，就地为它写一个，不为它再立一个公共件。 */
function LabeledField({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-meta text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  )
}

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
 * `world` 里只有 `places` 会动（id → 人读的名字）；`ledger`/`facts`/`ambient` 与以后加的键
 * 一律靠展开原样带回，不在这里声明。
 */
export interface EditableWorld {
  places?: Record<string, string>
  [key: string]: unknown
}

/**
 * 作者壳自己声明的最小内容包类型：web 拿不到 `@ai-world/core`，也不能为此加依赖。
 * 只列出会动的字段；没声明的字段靠展开复制原样回到提交的 JSON 里。
 */
export interface EditablePack {
  title: string
  opening?: string
  scene?: string
  world: EditableWorld
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
        {errors.length === 0 ? (
          <p className="text-meta text-ink-soft">正在读内容包…</p>
        ) : (
          <Alert type="error" showIcon title={errors.join('；')} />
        )}
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

  function updatePlace(id: string, name: string): void {
    if (pack === null) return
    setPack({ ...pack, world: { ...pack.world, places: { ...(pack.world.places ?? {}), [id]: name } } })
  }

  function updateName(id: string, name: string): void {
    if (pack === null) return
    setPack({ ...pack, names: { ...(pack.names ?? {}), [id]: name } })
  }

  function updateItem(id: string, name: string): void {
    if (pack === null) return
    setPack({ ...pack, items: { ...(pack.items ?? {}), [id]: name } })
  }

  function updateCanon(index: number, line: string): void {
    if (pack === null) return
    setPack({ ...pack, canon: pack.canon.map((item, i) => (i === index ? line : item)) })
  }

  function removeCanon(index: number): void {
    if (pack === null) return
    setPack({ ...pack, canon: pack.canon.filter((_, i) => i !== index) })
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
        {errors.length > 0 && <Alert type="error" showIcon title={errors.join('；')} className="mb-4" />}

        <section className="mb-8 flex flex-col gap-3">
          <LabeledField label="opening（首屏散文，≤600 字）" htmlFor="pack-opening">
            <Input.TextArea
              id="pack-opening"
              rows={6}
              value={pack.opening ?? ''}
              onChange={(event) => setPack({ ...pack, opening: event.target.value })}
            />
          </LabeledField>
          <LabeledField label="scene（现场一句话，≤160 字）" htmlFor="pack-scene">
            <Input.TextArea
              id="pack-scene"
              rows={2}
              value={pack.scene ?? ''}
              onChange={(event) => setPack({ ...pack, scene: event.target.value })}
            />
          </LabeledField>
        </section>

        <section className="mb-8 flex flex-col gap-3">
          <h3 className="text-meta text-ink-soft">地点、实体与物品显示名</h3>
          <div className="flex flex-col gap-2">
            <h4 className="text-meta text-ink-soft">places</h4>
            {Object.entries(pack.world?.places ?? {}).map(([id, name]) => (
              <LabeledField key={id} label={id}>
                <Input
                  value={name}
                  aria-label={`地点 ${id} 的显示名`}
                  onChange={(event) => updatePlace(id, event.target.value)}
                />
              </LabeledField>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="text-meta text-ink-soft">names</h4>
            <p className="text-meta text-ink-soft">改显示名只影响玩家投影与上下文标签；core、voice、beliefs、canon 里的旧称呼不会自动改。</p>
            {Object.entries(pack.names ?? {}).map(([id, name]) => (
              <LabeledField key={id} label={id}>
                <Input
                  value={name}
                  aria-label={`实体 ${id} 的显示名`}
                  onChange={(event) => updateName(id, event.target.value)}
                />
              </LabeledField>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="text-meta text-ink-soft">items</h4>
            {Object.entries(pack.items ?? {}).map(([id, name]) => (
              <LabeledField key={id} label={id}>
                <Input
                  value={name}
                  aria-label={`物品 ${id} 的显示名`}
                  onChange={(event) => updateItem(id, event.target.value)}
                />
              </LabeledField>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h3 className="mb-2 text-meta text-ink-soft">人物</h3>
          {pack.characters.map((character, characterIndex) => (
            <fieldset key={character.id} className="mb-6 flex flex-col gap-3 border border-rule p-3">
              <legend className="px-1 text-meta text-ink-soft">{character.id}</legend>
              <LabeledField label="core" htmlFor={`${character.id}-core`}>
                <Input.TextArea
                  id={`${character.id}-core`}
                  rows={6}
                  value={character.core ?? ''}
                  onChange={(event) => updateCharacter(characterIndex, { core: event.target.value })}
                />
              </LabeledField>
              <LabeledField label="voice" htmlFor={`${character.id}-voice`}>
                <Input.TextArea
                  id={`${character.id}-voice`}
                  rows={2}
                  value={character.voice ?? ''}
                  onChange={(event) => updateCharacter(characterIndex, { voice: event.target.value })}
                />
              </LabeledField>

              <div className="flex flex-col gap-2">
                <h4 className="text-meta text-ink-soft">drives</h4>
                {character.drives.map((drive, driveIndex) => (
                  <div key={drive.id} className="flex items-start gap-2">
                    <div className="flex-1">
                      <LabeledField label={drive.id}>
                        <Input
                          value={drive.text}
                          aria-label={`${character.id} 的 ${drive.id} 文本`}
                          onChange={(event) => updateDrive(characterIndex, driveIndex, { text: event.target.value })}
                        />
                      </LabeledField>
                    </div>
                    <LabeledField label="heat">
                      <InputNumber
                        value={drive.heat}
                        min={0}
                        max={1}
                        step={0.05}
                        aria-label={`${character.id} 的 ${drive.id} heat`}
                        onChange={(heat) => {
                          // 清空输入框时 antd 给 null，别把它写进上层状态
                          if (heat !== null) updateDrive(characterIndex, driveIndex, { heat })
                        }}
                      />
                    </LabeledField>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <h4 className="text-meta text-ink-soft">beliefs</h4>
                {Object.entries(character.beliefs).length === 0 ? (
                  <p className="text-meta text-ink-soft">还没有信念。</p>
                ) : (
                  Object.entries(character.beliefs).map(([key, value]) => (
                    <LabeledField key={key} label={key}>
                      <Input
                        value={value}
                        aria-label={`${character.id} 的信念 ${key}`}
                        onChange={(event) =>
                          updateCharacter(characterIndex, {
                            beliefs: { ...character.beliefs, [key]: event.target.value },
                          })
                        }
                      />
                    </LabeledField>
                  ))
                )}
              </div>
            </fieldset>
          ))}
        </section>

        <section className="mb-8 flex flex-col gap-2">
          <h3 className="text-meta text-ink-soft">canon</h3>
          <ul aria-label="canon" className="flex flex-col gap-2">
            {pack.canon.map((line, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="flex-1">
                  <Input.TextArea
                    rows={2}
                    value={line}
                    aria-label={`canon 第 ${index + 1} 条`}
                    onChange={(event) => updateCanon(index, event.target.value)}
                  />
                </div>
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  aria-label={`删除第 ${index + 1} 项`}
                  onClick={() => removeCanon(index)}
                />
              </li>
            ))}
            <li>
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => setPack({ ...pack, canon: [...pack.canon, ''] })}>
                一条 canon
              </Button>
            </li>
          </ul>
        </section>

        <Collapse
          ghost
          size="small"
          items={[
            {
              key: 'world',
              label: '世界结构（只读）',
              children: (
                <pre className="overflow-x-auto whitespace-pre-wrap break-all text-meta text-ink-soft">
                  {JSON.stringify(
                    {
                      title: pack.title,
                      world: pack.world,
                      player: pack.player,
                      names: pack.names,
                      items: pack.items,
                      aliases: pack.aliases,
                    },
                    null,
                    2,
                  )}
                </pre>
              ),
            },
          ]}
        />
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-rule p-3">
        <p className="text-meta text-ink-soft">保存只写 content/，本局不变；新内容要开新局才生效。</p>
        <Button type="primary" loading={saving} onClick={() => void save()}>
          保存
        </Button>
      </footer>
    </div>
  )
}
