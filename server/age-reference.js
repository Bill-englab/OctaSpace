const CDC = 'https://www.cdc.gov/act-early/milestones/4-years.html';
const MOE = 'https://www.moe.gov.cn/jyb_xwfb/xw_zt/moe_357/jyzt_2015nztzl/xueqianjiaoyu/yaowen/202104/W020210820338905908083.pdf';

export const AGE_REFERENCE_VERSION = 'four-years-2026-10';

const FOUR_YEAR_ITEMS = [
  { id: 'de-play', dimension: 'de', stage: 'current', text: '在游戏中扮演角色、愿意和其他孩子一起玩，是四岁阶段可以观察的社会互动表现。', sourceUrl: CDC },
  { id: 'de-care', dimension: 'de', stage: 'current', text: '留意孩子如何回应难过或受伤的人，以及如何在不同场合调整行为。', sourceUrl: CDC },
  { id: 'de-next', dimension: 'de', stage: 'next', text: '四至五岁阶段可逐步学习用商量、交换或轮流的方式参与游戏和处理同伴分歧。', sourceUrl: MOE },
  { id: 'zhi-talk', dimension: 'zhi', stage: 'current', text: '四岁阶段可观察孩子能否讲述当天发生的一件事、回答简单问题。', sourceUrl: CDC },
  { id: 'zhi-story', dimension: 'zhi', stage: 'current', text: '可以留意孩子能否说出熟悉故事接下来会发生什么。', sourceUrl: CDC },
  { id: 'zhi-next', dimension: 'zhi', stage: 'next', text: '语言与思考可通过提问、讲述、比较和亲手探索继续发展；不以识字数量作为单一尺度。', sourceUrl: MOE },
  { id: 'ti-ball', dimension: 'ti', stage: 'current', text: '四岁阶段可在游戏中观察接大球、拿笔等大动作与手部动作。', sourceUrl: CDC },
  { id: 'ti-care', dimension: 'ti', stage: 'current', text: '在成人看护下自己取食物或倒水，也是值得观察的动作和自理表现。', sourceUrl: CDC },
  { id: 'ti-next', dimension: 'ti', stage: 'next', text: '继续提供适宜、愉快的运动和手部操作机会，并留意生活习惯与安全。', sourceUrl: MOE },
  { id: 'mei-song', dimension: 'mei', stage: 'current', text: '四岁阶段可以留意孩子是否愿意唱出熟悉歌曲、故事或童谣的部分内容。', sourceUrl: CDC },
  { id: 'mei-next', dimension: 'mei', stage: 'next', text: '四至五岁阶段可逐步通过哼唱、动作、节奏或画画表达自己的感受与想象。', sourceUrl: MOE },
  { id: 'lao-help', dimension: 'lao', stage: 'current', text: '四岁阶段可能愿意当小帮手，参与简单、力所能及的家庭事务。', sourceUrl: CDC },
  { id: 'lao-care', dimension: 'lao', stage: 'current', text: '在成人看护下自己倒水、解开部分纽扣等，可作为生活自理的观察机会。', sourceUrl: CDC },
  { id: 'lao-next', dimension: 'lao', stage: 'next', text: '让孩子在日常生活中尝试更多自己能做的事，成人提供支持而不过度包办。', sourceUrl: MOE }
];

export function getAgeReference(birthday, onDate) {
  if (!birthday || !onDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthday) || !/^\d{4}-\d{2}-\d{2}$/.test(onDate)) return null;
  const born = new Date(`${birthday}T00:00:00Z`);
  const at = new Date(`${onDate}T00:00:00Z`);
  if (!Number.isFinite(born.getTime()) || !Number.isFinite(at.getTime()) || born.toISOString().slice(0, 10) !== birthday || at.toISOString().slice(0, 10) !== onDate) return null;
  let ageMonths = (at.getUTCFullYear() - born.getUTCFullYear()) * 12 + at.getUTCMonth() - born.getUTCMonth();
  if (at.getUTCDate() < born.getUTCDate()) ageMonths--;
  if (ageMonths < 48 || ageMonths >= 60) return null;
  return {
    ageMonths,
    ageLabel: `${Math.floor(ageMonths / 12)}岁${ageMonths % 12}个月`,
    version: AGE_REFERENCE_VERSION,
    items: FOUR_YEAR_ITEMS
  };
}
