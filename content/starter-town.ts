import type { ContentPack } from '../src/core/content.ts'

const ANN_CORE =
  '安十七岁跟着父亲从堪萨斯往西走，走到半路，车辙里埋了母亲，父亲从此只跟骡子说话。她接下这间酒馆的时候欠着三笔债，用了六年还清；账本锁在柜台下的铁盒里，谁也不给看。她记得每个熟客的欠账，也记得他们撒谎时的样子，却记不住自己上一次没在打烊后数钱是什么时候。有人在她店里拔枪，她先把杯子收走，再开口，声音不高，尾音短，像在报账。她怕明火，灶膛里爆出一粒火星也要亲自去踩。谁拍她的柜台，她会等那一下拍完，再把手从抹布上抬起来。镇上的人都知道，跟她赊账可以，跟她撒谎不行。'

const DOC_CORE =
  '道森医生在东部的医学院念到第三年，因为一场他没救回来的人被赶了出来，从那以后他改了姓，只让人叫他医生。腰里那枚取不出来的弹片让他在变天前一夜睡不着，疼起来就把左手按在左肋下，一句话也不说。药包里还剩十一支吗啡，他每次只肯拿出一支；给谁、不给谁，他心里有一张从不说出口的名单。他坐在最靠里的桌子，背贴墙，任何人从门口走到他面前，他先闻到鞋上的土。他讲话慢，常把一句话的后半截省掉，等你自己补，补错了他也不纠正。看病他不收现钱，只收一瓶没开封的酒，酒放在桌上，他不喝。'

export const STARTER_TOWN: ContentPack = {
  world: {
    ledger: {
      clock: 0,
      // 灯作为实体登记：phys 只能挂在 at 里存在的实体上。
      at: { player: 'saloon', ann: 'saloon', doc: 'saloon', lamp: 'saloon' },
      holds: { ann: { 'ledger-book': 1 } },
      phys: { lamp: { lit: true } },
      rel: {},
      knows: {},
    },
    facts: {},
    places: { saloon: '酒馆' },
  },
  characters: [
    {
      id: 'ann',
      core: ANN_CORE,
      voice: '短句，报账式的平声；先收走杯子，再开口。',
      drives: [
        { id: 'keep-saloon', text: '让这间酒馆撑过下一年', heat: 0.8 },
        { id: 'no-open-fire', text: '不在自己店里看见明火', heat: 0.4 },
      ],
      beliefs: { doc: '他手里那点药，比镇上所有的枪都值钱' },
      experience: [],
      busyUntil: 0,
    },
    {
      id: 'doc',
      core: DOC_CORE,
      voice: '慢，半句话，把结论留给你自己补。',
      drives: [{ id: 'count-morphine', text: '数清药包里剩下的十一支吗啡', heat: 0.6 }],
      // 错的：安早就还清了，只是从没对人说过。
      beliefs: { ann: '她欠着某个人的东西，只是她不肯说' },
      experience: [],
      busyUntil: 0,
    },
  ],
  canon: [
    '安还清了父亲留下的三笔债，账本锁在柜台下的铁盒里。',
    '道森医生没能念完东部的医学院，此后只让人叫他医生。',
    '玩家是今晚唯一一张生面孔，安倒酒前先看了一眼他的手。',
  ],
  player: 'player',
}
