/**
 * 广场内容种子：20 个贴近生活的议题与个人决策，覆盖
 * 支持理由 / 公开反驳 / 作者回应 / 承认击穿 / 出结论书 / 立帖为证 等状态。
 *
 * 运行：pnpm db:seed:plaza（需要 DATABASE_URL，且已执行迁移）
 * 幂等：按话题标题跳过已存在的条目，可安全重复执行。
 */
import { and, eq } from 'drizzle-orm';
import { db } from './client';
import { challenges, claims, topics, users } from './schema';
import { publishConclusion } from './services/conclusion';
import { placePrediction } from './services/predictions';
import { publishTopic } from './services/publish';
import { postRebutal, postSupport, respondToChallenge } from './services/rebuttal';
import { concedeToChallenge, promoteClaimToReasonLayer } from './services/tree';

/* ---------------- 种子用户：都是虚构人物，仅用于填充讨论 ---------------- */

const PERSONAS: Record<string, { displayName: string; bio: string }> = {
  chenmo: { displayName: '陈默', bio: '在北京做产品的第八年，最近在认真算一笔回家的账' },
  xiaoyu: { displayName: '林小雨', bio: '小学语文老师，带过三届毕业班' },
  laozhou: { displayName: '老周', bio: '四十五岁，国企中层，两个孩子他爸' },
  amay: { displayName: '阿 May', bio: '自由插画师，靠接稿生活第七年' },
  wanggong: { displayName: '王工', bio: '后端工程师，带过十二人的团队' },
  fanshu: { displayName: '番薯', bio: '大四在读，正在准备考研' },
  zheng: { displayName: '郑医生', bio: '三甲医院住院医师，夜班生活体验者' },
  mimi: { displayName: '米粒妈', bio: '两个孩子的妈妈，白天上班晚上辅导作业' },
  laozhao: { displayName: '老赵', bio: '在老城区开了十年小饭馆' },
  soda: { displayName: '苏打水', bio: '工作两年的运营，住在通勤一小时的合租房' },
};

/* ---------------- 内容定义 ---------------- */

type Resolution = 'open' | 'responded' | 'conceded';

interface RebuttalSpec {
  /** 反驳第几条支持理由（下标从 0 开始） */
  reason: number;
  by: string;
  paraphrase: string;
  title: string;
  body: string;
  resolution: Resolution;
  response?: { title: string; body: string };
}

interface TopicSpec {
  type: 'decision' | 'claim';
  owner: string;
  title: string;
  body: string;
  stance: string;
  lean: 'pro' | 'con' | 'neutral';
  tags: string[];
  /** 立帖为证：多少天后揭晓（仅 decision 类型有效） */
  stakeDays?: number;
  bounty?: boolean;
  reasons: { by: string; title: string; body: string }[];
  rebuttals: RebuttalSpec[];
  conclusion?: {
    verdict: string;
    recommendation?: string;
    premises?: string;
    /** 出结论前把哪几条支持理由提升到理由层并一并采纳（下标）；根立场始终被采纳 */
    promote?: number[];
    /** 仍有未决反驳时，是否带险关闭 */
    acknowledgeOpen?: boolean;
  };
  predictions?: { by: string; statement: string; predictedOutcome: 'regret' | 'no_regret' }[];
}

const TOPICS: TopicSpec[] = [
  {
    type: 'decision',
    owner: 'chenmo',
    title: '要不要把北京的工作辞了回成都？',
    body: '在北京第八年，房贷还了一半，孩子明年上小学。成都那边有个机会，薪资大概是现在的七折。',
    stance: '回成都：用一线城市攒下的经验，换更低的生活成本和离父母更近的距离',
    lean: 'neutral',
    tags: ['职业', '生活方式', '家庭'],
    stakeDays: 240,
    reasons: [
      {
        by: 'chenmo',
        title: '房价收入比的差距，比工资差距更影响可支配收入',
        body: '同样一套三居，成都的总价大约是北京的三分之一；收入打七折，但月供和日常开销降得更多，每月能真正留下来的钱反而可能变多。',
      },
      {
        by: 'chenmo',
        title: '父母过了七十岁，异地照护的时间成本迟早要还',
        body: '过去三年，父母住院两次，我都是买最早的航班赶回去。这个成本现在靠请假消化，往后只会更贵。',
      },
      {
        by: 'soda',
        title: '成都的互联网岗位在增加，三十多岁跳槽的窗口还没关上',
        body: '2024 年之后成都多了一批研发中心和区域总部，同岗位竞争确实小一些，只是薪资天花板低。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'wanggong',
        paraphrase:
          '你的意思是「房价收入比的差距，比工资差距更影响可支配收入」——成都总价大概是北京的三分之一，收入打七折但月供和日常开销降得更多。也就是说，只要每月真正留下来的钱变多，收入低一点也划算。',
        title: '收入差距会随年限放大，而房贷压力是固定的',
        body: '三十岁之后，一线和内地同岗位的收入差距通常不是 30%，而是每年继续拉大；房子的压力是固定数额，收入差距是复利。',
        resolution: 'responded',
        response: {
          title: '差距确实会放大，但我的天花板本来就不高',
          body: '我不在明星公司，这两年的涨薪幅度已经降到个位数。与其赌未来十年的复利，我更愿意先锁定确定的生活质量。',
        },
      },
      {
        reason: 2,
        by: 'laozhou',
        paraphrase:
          '你主张「成都的互联网岗位在增加，三十多岁跳槽的窗口还没关上」，因为研发中心和区域总部变多了、同岗位竞争小一些。换句话说，岗位变多就意味着机会变多——这句我不同意。',
        title: '岗位增加的同时，同资历的竞争者也在往成都挤',
        body: '成都这两年承接的不只是岗位，还有从一线回流的人。同等资历的对手变多，面试难度并不比北京低。',
        resolution: 'open',
      },
    ],
    predictions: [
      { by: 'wanggong', statement: '一年半以后他会发现，留在成都同样要为房子和学区焦虑', predictedOutcome: 'regret' },
      { by: 'soda', statement: '生活质量会明显变好，回访时他不会后悔', predictedOutcome: 'no_regret' },
      { by: 'fanshu', statement: '回成都后大概率还会想办法接一线城市的远程单子', predictedOutcome: 'no_regret' },
    ],
  },
  {
    type: 'decision',
    owner: 'mimi',
    title: '该不该给上小学的孩子报周末补习班？',
    body: '孩子四年级，数学中游、语文偏弱。同班一半同学周末都在补课，我从上学期开始犹豫到现在。',
    stance: '先不报全科补习，只补真正卡住的那一环',
    lean: 'con',
    tags: ['教育', '家庭'],
    reasons: [
      {
        by: 'mimi',
        title: '周末补习挤掉的是睡眠和运动，收益却在递减',
        body: '孩子平时睡眠已经不足九小时，周末再上两节课，情绪明显变差，作业效率也没提高。',
      },
      {
        by: 'xiaoyu',
        title: '先弄清楚是哪一环卡住，比多上一门课更有效',
        body: '我班上补课效果最好的一批孩子，都是先找到具体卡点（计算、阅读速度）再针对性补，而不是全科跟着上。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'zheng',
        paraphrase:
          '你主张「周末补习挤掉的是睡眠和运动，收益却在递减」——孩子平时睡眠不足九小时，补课之后情绪变差、作业效率也没提高。也就是用健康换分数不划算，这个判断我理解。',
        title: '学校的进度不会等你补完睡眠',
        body: '减负的道理都对，但班级进度是统一的。孩子一旦掉队，后面要补的就不只是那一环。',
        resolution: 'responded',
        response: {
          title: '掉队和补课不是一回事，我盯的是他的实际掌握度',
          body: '我每周会看他的错题本，知道他在哪个知识点掉队。补这一环用一个下午就够，不需要把周末全部押上去。',
        },
      },
    ],
    conclusion: {
      verdict: '不报全科补习，先补具体卡点；把周末留给孩子自己安排',
      recommendation: '先做两周错题归因，确认卡点后再找一对一短训，每次不超过一个下午',
      premises: '适用于小学阶段、家长能稳定陪伴并查看作业的家庭',
      promote: [1],
    },
  },
  {
    type: 'decision',
    owner: 'soda',
    title: '租在公司附近的老破小，还是通勤一小时的新小区？',
    body: '预算差不多：公司三公里内的老房子 45 平、无电梯；外环新小区 70 平、地铁一小时。',
    stance: '选通勤一小时的新小区，居住质量是长期变量',
    lean: 'con',
    tags: ['生活方式', '租房'],
    stakeDays: 150,
    reasons: [
      {
        by: 'soda',
        title: '每天两小时通勤，一年就是二十多天不见天日的时间',
        body: '两小时通勤一年累计约 480 小时，相当于二十个完整工作日。这笔时间账比多出来的二十平更直观。',
      },
      {
        by: 'amay',
        title: '老小区没法解决的噪音和采光，是每天都在消耗情绪的损耗',
        body: '我做自由职业，在家时间比通勤族更长。隔音差、下午三点就要开灯的房间，会直接影响工作状态。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'fanshu',
        paraphrase:
          '你算的是「每天两小时通勤，一年就是二十多天不见天日的时间」——累计四百八十小时、相当于二十个工作日。把通勤当成纯损耗，但我认为这段时间并不是完全浪费的。',
        title: '通勤时间不一定等于损耗，关键看你怎么用',
        body: '地铁上能听播客、看电子书，我复习考研的资料基本都是在通勤路上过完的。',
        resolution: 'responded',
        response: {
          title: '能利用的通勤时间是幸存者偏差',
          body: '你说的没错，但只适用于有座位的固定线路。我这条线早晚高峰挤到没法拿出手机，站一小时就是纯消耗。',
        },
      },
    ],
    predictions: [
      { by: 'amay', statement: '一年后她会后悔，最后还是搬回市区', predictedOutcome: 'regret' },
      { by: 'mimi', statement: '住得舒服以后，通勤的怨气会被抵消掉', predictedOutcome: 'no_regret' },
    ],
  },
  {
    type: 'decision',
    owner: 'wanggong',
    title: '要不要贷款买一辆二十万的车？',
    body: '家里有老人和小孩，周末出行全靠打车；上班通勤地铁四十分钟，不太需要车。',
    stance: '先不贷款买车，用打车加租车覆盖出行需求',
    lean: 'con',
    tags: ['消费', '家庭'],
    reasons: [
      {
        by: 'wanggong',
        title: '车价只是首付，保险、保养、车位是持续支出',
        body: '按二十万的车算，每年保险加保养加停车至少两万，还没算折旧，平均每月成本比打车高。',
      },
      {
        by: 'laozhao',
        title: '真正需要车的是节假日，租车更匹配这种波峰需求',
        body: '我店里几个有车的年轻人，一年也就节假日开几次，平时停在楼下吃灰。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'mimi',
        paraphrase:
          '你的主张是「车价只是首付，保险、保养、车位是持续支出」——二十万的车每年保险保养停车至少两万，还没算折旧。也就是用总拥有成本对比打车，但你漏算了带孩子的场景。',
        title: '带着两个孩子和老人，打车不是等价替代',
        body: '雨天抱着孩子站在路边等车的体验，不是账面上的每月两千块能换算的。',
        resolution: 'conceded',
      },
    ],
  },
  {
    type: 'decision',
    owner: 'amay',
    title: '要不要给家里养一只猫？',
    body: '独居第四年，工作时间弹性但经常出差；很喜欢猫，又怕照顾不好。',
    stance: '养，但先解决出差期间的照护安排',
    lean: 'pro',
    tags: ['生活方式', '宠物'],
    stakeDays: 200,
    reasons: [
      {
        by: 'amay',
        title: '独居生活的情绪支撑，是养猫最直接的价值',
        body: '一个人住久了，回家有活物应声这件事本身就有意义，这不需要用别的收益来论证。',
      },
      {
        by: 'amay',
        title: '掉毛、看病、出差照护是必须提前算清的隐性成本',
        body: '猫的医疗支出波动很大，老年期一次住院就可能是几千块，这部分要留出预算。',
      },
    ],
    rebuttals: [
      {
        reason: 1,
        by: 'mimi',
        paraphrase:
          '你提到「掉毛、看病、出差照护是必须提前算清的隐性成本」，还说老年期一次住院就可能是几千块。也就是养之前要把长期开销想清楚，这点我完全同意。',
        title: '对孩子来说，和宠物一起长大是难得的生命教育',
        body: '我家养狗三年，孩子学会了喂食、清理和面对离别，这些是课堂上学不到的。',
        resolution: 'responded',
        response: {
          title: '我不否认这一点，只是这不构成养猫的必要理由',
          body: '如果为了教育孩子而养，孩子失去兴趣后，照顾的责任会全部落到大人身上，这在我家已经发生过了。',
        },
      },
    ],
    predictions: [
      { by: 'soda', statement: '她出差回来会发现猫比想象中好养，不会后悔', predictedOutcome: 'no_regret' },
      { by: 'laozhou', statement: '半年后出差安排撑不住，会开始找人寄养', predictedOutcome: 'regret' },
    ],
  },
  {
    type: 'decision',
    owner: 'laozhou',
    title: '该不该让父母搬来一起住？',
    body: '父母在县城，身体还好但独自生活；我家三居室，孩子上初中，妻子对此比较犹豫。',
    stance: '先在同小区租房给父母住，不急着合住',
    lean: 'neutral',
    tags: ['家庭', '养老'],
    reasons: [
      {
        by: 'laozhou',
        title: '照护半径决定了应急响应速度，住得近比住一起更灵活',
        body: '同小区步行五分钟，夜里出事能马上到；合住反而会因为作息和习惯差异积累矛盾。',
      },
      {
        by: 'xiaoyu',
        title: '三代同堂的相处成本，往往由家里最不善表达的那个人承担',
        body: '我见过太多家庭，最后妥协的都是媳妇或者老人自己，情绪成本没有出口。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'chenmo',
        paraphrase:
          '你的意见是「照护半径决定了应急响应速度，住得近比住一起更灵活」——同小区步行五分钟，夜里出事能马上到，合住反而容易积累矛盾。也就是说物理距离解决了照护问题，但我认为照护不只是距离问题。',
        title: '老人真正需要的是被需要的感觉，不只是十分钟的距离',
        body: '我父母搬来之后，帮忙接送孩子，整个人精神状态都不一样了。分开住很难有这种参与感。',
        resolution: 'responded',
        response: {
          title: '参与感可以用固定的相处安排来补',
          body: '我们现在的做法是每周三晚饭和整个周末一起过，接送孩子也交给他们。分开住不等于疏远。',
        },
      },
    ],
    conclusion: {
      verdict: '分开住、住得近，比直接合住更稳妥',
      recommendation: '在同小区或步行十分钟内租房，固定每周两到三次共同用餐，接送孩子交给父母',
      premises: '适用于父母生活尚能自理、附近有可租住处的家庭',
      promote: [1],
    },
  },
  {
    type: 'decision',
    owner: 'chenmo',
    title: '要不要花两年积蓄读一个在职 MBA？',
    body: '工作八年，做到产品负责人；学费加机会成本接近四十万，目标是转管理岗。',
    stance: '读，但要选能带来具体转岗机会的项目',
    lean: 'pro',
    tags: ['职业', '教育'],
    reasons: [
      {
        by: 'chenmo',
        title: '转管理岗缺的是系统方法和同级视角，不是更多项目经验',
        body: '这几年我做的都是执行层的优化，真正缺的是财务、组织、战略这些没机会实践的部分。',
      },
      {
        by: 'wanggong',
        title: '同学网络的价值来自筛选，而不是课程本身',
        body: '同学大多是带团队的人，日常讨论的起点就不一样，这部分比课堂对我影响更大。',
      },
    ],
    rebuttals: [
      {
        reason: 1,
        by: 'fanshu',
        paraphrase:
          '你说「同学网络的价值来自筛选，而不是课程本身」，因为同学大多是带团队的人，讨论的起点就不一样。意思是花钱买的是一个圈子，但我对这种筛选的实际作用存疑。',
        title: '人脉不是买来的，是交换出来的',
        body: '同学愿不愿意跟你深聊，取决于你手里有没有对方需要的东西，而不是你们是不是同班。',
        resolution: 'open',
      },
    ],
    conclusion: {
      verdict: '值得读，但前提是项目能直接对接目标岗位，而不是买个文凭',
      recommendation: '报名前先确认近三届学员的转岗去向，再决定是否投入这笔钱',
      premises: '适用于本职工作稳定、学费不超过两年可支配收入的情况',
      promote: [0],
      acknowledgeOpen: true,
    },
  },
  {
    type: 'decision',
    owner: 'xiaoyu',
    title: '该不该把工资的一部分交给父母打理？',
    body: '刚工作两年，攒钱速度慢，父母提出帮我管一部分工资，说年轻人存不下钱。',
    stance: '给固定比例让父母帮忙存，但保留自己的账户',
    lean: 'neutral',
    tags: ['理财', '家庭'],
    reasons: [
      {
        by: 'xiaoyu',
        title: '对我这种自制力差的人，强制储蓄是有效的',
        body: '过去一年我每月交给父母两千，年底拿回来两万四，靠我自己肯定花掉了。',
      },
      {
        by: 'laozhao',
        title: '财务独立是成年人的底线，钱不能完全交出去',
        body: '我见过把工资全交给家里、后来想换工作都不好意思开口的年轻人。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'fanshu',
        paraphrase:
          '你主张「对我这种自制力差的人，强制储蓄是有效的」——每月交给父母两千、年底拿回两万四，靠自己肯定花掉了。也就是靠外部约束来存钱，但我觉得这个前提本身有问题。',
        title: '交给父母不等于存下来，只是换了个地方花',
        body: '很多家庭把这笔钱用在了人情往来或者补贴兄弟姐妹上，最后说不清楚。',
        resolution: 'responded',
        response: {
          title: '我做了单独账户和年度对账，就是为了避免说不清',
          body: '这笔钱单独放在一张存单里，年底一起看余额，用途只限我本人，家里不挪用。',
        },
      },
    ],
    conclusion: {
      verdict: '可以交给父母一部分，但要限定比例、独立账户和年度对账',
      recommendation: '比例不超过月收入的 30%，每季度确认一次余额和用途',
      premises: '适用于父母无重大债务、家庭内部能就用途达成一致的情况',
      promote: [1],
    },
  },
  {
    type: 'decision',
    owner: 'soda',
    title: '要不要参加十年没联系的初中同学聚会？',
    body: '群里有人召集，地点在外地，路费加住宿要花两天和两千块；去的人里有当年关系不错的。',
    stance: '不去，把时间留给现在的关系',
    lean: 'con',
    tags: ['社交', '生活方式'],
    stakeDays: 90,
    reasons: [
      {
        by: 'soda',
        title: '十年没联系说明关系早就自然淡了，聚会改变不了这个事实',
        body: '真正重要的关系不需要靠一次聚会续上；需要靠一次聚会续上的，多半也续不上。',
      },
      {
        by: 'amay',
        title: '同学会上真正的交流时间，往往比不上在群里聊一次',
        body: '十几个人一桌，能单独说上话的不超过三个人，剩下的时间都在应付场面。',
      },
    ],
    rebuttals: [
      {
        reason: 1,
        by: 'mimi',
        paraphrase:
          '你说「同学会上真正的交流时间，往往比不上在群里聊一次」——十几个人一桌，能单独说上话的不超过三个。也就是这种场合效率很低，但我的经验恰好相反。',
        title: '有些关系只有面对面才谈得下去',
        body: '去年我去了二十年没见的同学聚会，和当年的同桌聊了半小时，解开了一个心结。',
        resolution: 'responded',
        response: {
          title: '你的经历成立，但那需要双方都愿意深聊',
          body: '我没说聚会没有价值，只是对现在的我来说，这两天时间更想留给家里。',
        },
      },
    ],
    predictions: [
      { by: 'mimi', statement: '她去了以后会发现比想象中自在，不会后悔', predictedOutcome: 'no_regret' },
      { by: 'fanshu', statement: '不去也不会有任何影响，本来就不重要', predictedOutcome: 'no_regret' },
    ],
  },
  {
    type: 'decision',
    owner: 'laozhao',
    title: '为了省钱每天自己做饭，值不值？',
    body: '外卖一顿均价三十，自己做饭成本大概十二块，但每天要多花一小时。',
    stance: '长期看值得，但要算进时间成本',
    lean: 'pro',
    tags: ['消费', '健康'],
    reasons: [
      {
        by: 'laozhao',
        title: '按一年算，自己做饭能省下的钱接近一台冰箱的价格',
        body: '每天两顿外卖八十块，自己做三十块，一年下来差一万多。',
      },
      {
        by: 'zheng',
        title: '自己做饭更大的收益是饮食结构可控',
        body: '外卖的油盐和分量是固定的，长期吃下去体重和血脂的变化比省下的钱更值钱。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'wanggong',
        paraphrase:
          '你算的是「按一年算，自己做饭能省下的钱接近一台冰箱的价格」——每天两顿外卖八十、自己做三十，一年差一万多。也就是纯粹的金钱账，但一小时的时间成本不能忽略。',
        title: '一小时的时间对某些人来说比三十块钱贵得多',
        body: '按我的时薪算，每天一小时值两百块，一年下来的机会成本远超省下的钱。',
        resolution: 'responded',
        response: {
          title: '能自由变现的这一小时才有那个价格',
          body: '如果你的下班时间真的能换钱，那这笔账确实不划算；多数人省下的这一小时只是刷手机，那就该按零计算。',
        },
      },
    ],
    conclusion: {
      verdict: '值得，但前提是那一小时本来也没有更高的用途',
      recommendation: '先试一个月，周末备菜、工作日只做一次加热，把时间压到半小时以内',
      premises: '适用于通勤稳定、家里有基本炊具、对饮食有控制意愿的人',
      promote: [1],
    },
  },
  {
    type: 'claim',
    owner: 'wanggong',
    title: '远程办公会长期降低团队效率',
    body: '我们团队全远程一年，交付没耽误，但内部的隐性成本一直在涨。',
    stance: '全员长期远程会降低团队效率，混合办公才是可行解',
    lean: 'pro',
    tags: ['职场', '公共议题'],
    reasons: [
      {
        by: 'wanggong',
        title: '异步沟通把一次对话拆成两天，决策链被拉长',
        body: '以前走廊里十分钟能定的事，现在要写文档、等回复、开同步会，平均要两天。',
      },
      {
        by: 'wanggong',
        title: '新人带教成本上升，且很难被度量',
        body: '远程环境下新人提问的门槛变高，一个简单的环境问题可能卡一整天。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'amay',
        paraphrase:
          '你的判断是「异步沟通把一次对话拆成两天，决策链被拉长」——以前走廊十分钟能定的事，现在要写文档、等回复、开同步会。也就是说远程让沟通变慢，我认为原因在于开会太多而不是远程本身。',
        title: '把会开少了以后，异步反而比现场更快',
        body: '我们团队取消了大半同步会，重要决策全部留档，讨论质量比在会议室里高。',
        resolution: 'responded',
        response: {
          title: '你的做法恰好说明了远程需要额外管理成本',
          body: '能取消的会是你们管理能力强，不是远程本身没有代价——为了做到这一点，我们专门加了两个人做流程。',
        },
      },
    ],
  },
  {
    type: 'claim',
    owner: 'xiaoyu',
    title: '短视频正在让人失去深度阅读的能力',
    body: '带了三年高年级，明显感觉学生能安静读书的时间在缩短。',
    stance: '短视频的消费方式，确实在削弱持续专注的能力',
    lean: 'pro',
    tags: ['教育', '公共议题'],
    reasons: [
      {
        by: 'xiaoyu',
        title: '注意力被切成十五秒的段落，长文本的节奏就不适应了',
        body: '班上能连续读二十分钟不抬头的人数，三年里从一半降到不到三分之一。',
      },
      {
        by: 'xiaoyu',
        title: '习惯了被动接收信息，主动检索和推理的意愿会下降',
        body: '遇到需要自己查证的问题，很多孩子的第一反应是等推送，而不是去翻资料。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'fanshu',
        paraphrase:
          '你说「注意力被切成十五秒的段落，长文本的节奏就不适应了」——能连续读二十分钟的人三年里从一半降到三分之一。意思是短视频直接导致了阅读能力下降，但这个因果我认为不成立。',
        title: '媒介形式变了，不等于能力退化',
        body: '我看短视频，也读长篇，工具变了而已。把上一代人担心电视的论调换了个说法。',
        resolution: 'open',
      },
    ],
  },
  {
    type: 'claim',
    owner: 'laozhou',
    title: '相亲时先谈收入和房产是理性的',
    body: '亲戚家孩子相亲，第一次见面就互相问了收入和房子，被说不懂浪漫。',
    stance: '在相亲这种以结婚为目标的场景里，先对齐经济条件是理性的',
    lean: 'pro',
    tags: ['情感', '社会'],
    reasons: [
      {
        by: 'laozhou',
        title: '婚姻是长期的共同经济安排，迟早要谈，早谈比晚谈代价低',
        body: '房子、债务、赡养安排都会影响婚后生活，等到感情深了再谈，反而更难抽身。',
      },
      {
        by: 'mimi',
        title: '前置筛选节省的是双方的时间，不是感情的分数',
        body: '相亲本来就是有限次数的匹配过程，把硬条件放前面，剩下的时间才能用来了解人。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'xiaoyu',
        paraphrase:
          '你主张「婚姻是长期的共同经济安排，迟早要谈，早谈比晚谈代价低」——房子、债务、赡养安排都会影响婚后生活。这个逻辑我理解，但放在第一次见面就执行，效果未必好。',
        title: '第一次见面就问经济条件，会筛掉愿意慢慢谈的人',
        body: '有些人不是回避经济问题，只是需要先建立基本的信任感，否则会直接退场。',
        resolution: 'open',
      },
    ],
  },
  {
    type: 'claim',
    owner: 'zheng',
    title: '城市应该对私家车收取拥堵费',
    body: '工作日的早晚高峰，市中心平均车速已经降到十五公里以下。',
    stance: '对进入核心区的私家车收费，用价格调节路权',
    lean: 'pro',
    tags: ['公共议题', '城市'],
    reasons: [
      {
        by: 'zheng',
        title: '道路是有限资源，免费使用必然导致过度使用',
        body: '伦敦和新加坡的经验都表明，收费之后核心区车速明显提升，公交出行比例上升。',
      },
      {
        by: 'zheng',
        title: '收费收入应该专项补贴公共交通，而不是进一般预算',
        body: '只有让不开车的人直接受益，这个政策才站得住脚。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'laozhao',
        paraphrase:
          '你说「道路是有限资源，免费使用必然导致过度使用」，还举了伦敦和新加坡收费后车速提升、公交比例上升的例子。也就是要靠价格来分配路权，但这会伤到真正有刚需的人。',
        title: '不是所有人都有替代方案，收费会变成对穷人的罚款',
        body: '我店里送货的、接送孩子的，很多线路没有合适的地铁，多出来的成本只能自己扛。',
        resolution: 'open',
      },
    ],
  },
  {
    type: 'claim',
    owner: 'fanshu',
    title: '选专业比选学校更重要',
    body: '正在填志愿，家里坚持让我冲一所更好的学校，哪怕专业要服从调剂。',
    stance: '对普通家庭的孩子来说，专业决定了入行门槛，优先于学校名气',
    lean: 'pro',
    tags: ['教育', '职业'],
    reasons: [
      {
        by: 'fanshu',
        title: '大部分岗位的第一道筛选是按专业来的，不是按学校',
        body: '招聘系统里专业不匹配的简历，往往在人工看到之前就被筛掉了。',
      },
      {
        by: 'fanshu',
        title: '学校的品牌溢价在毕业后三年内衰减得很快',
        body: '工作三年之后，面试官更关心你做过什么项目，而不是你从哪所学校毕业。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'chenmo',
        paraphrase:
          '你的判断是「大部分岗位的第一道筛选是按专业来的，不是按学校」——专业不匹配的简历在人工看到之前就被筛掉了。也就是专业是硬门槛，但很多岗位其实先看学校。',
        title: '大公司校招的第一道筛子恰恰是学校',
        body: '我参与过校招筛选，简历量太大的时候，学校名单是最先用来做初筛的条件。',
        resolution: 'responded',
        response: {
          title: '校招是一个渠道，不是唯一的入口',
          body: '如果目标是进大厂校招池，学校确实重要；但多数人的第一份工作来自实习、内推和中小公司，这些更看专业能力。',
        },
      },
    ],
  },
  {
    type: 'claim',
    owner: 'mimi',
    title: '健身私教课不值这个价',
    body: '一节私教课三百到五百，一年下来是一笔不小的支出。',
    stance: '多数人不需要长期买私教课，基础力量训练可以自学',
    lean: 'con',
    tags: ['健康', '消费'],
    reasons: [
      {
        by: 'mimi',
        title: '基础动作的知识已经充分公开，付费买的是监督而不是知识',
        body: '深蹲、硬拉、卧推的要领在公开资料里讲得很清楚，私教的价值主要在纠正和陪伴。',
      },
      {
        by: 'wanggong',
        title: '监督价值被夸大了，习惯养成不依赖教练',
        body: '我买了半年课，停课之后照样练；真正决定坚持的是时间和目标，不是有人在旁边数数。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'zheng',
        paraphrase:
          '你说「基础动作的知识已经充分公开，付费买的是监督而不是知识」——深蹲、硬拉的要领在公开资料里讲得很清楚。也就是私教缺乏独有价值，但从医学角度看这个判断有风险。',
        title: '动作错误造成的损伤成本，远高于课时费',
        body: '门诊里因为自学硬拉导致腰椎损伤的年轻人不少，一次治疗和康复的费用够买几十节课。',
        resolution: 'conceded',
      },
    ],
  },
  {
    type: 'claim',
    owner: 'wanggong',
    title: 'AI 生成的代码不应该直接上线',
    body: '团队里已经有人在用 AI 写业务代码，效率提升明显，但 review 的压力也在变大。',
    stance: 'AI 产出的代码必须经过人工理解与测试才能上线',
    lean: 'pro',
    tags: ['科技', '职场'],
    reasons: [
      {
        by: 'wanggong',
        title: 'AI 的错误是隐蔽的：能跑通，但在边界条件下会出错',
        body: '我见过几处生成的空值处理和并发逻辑，测试能过，但上线后在并发场景下出问题。',
      },
      {
        by: 'wanggong',
        title: '上线意味着有人为后果负责，而模型不承担责任',
        body: '出了事故要定位、要复盘、要承担损失，这个责任只能落在具体的人身上。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'soda',
        paraphrase:
          '你担心的是「AI 的错误是隐蔽的：能跑通，但在边界条件下会出错」——空值处理和并发逻辑测试能过，上线后才出问题。也就是质量问题，但我认为问题出在测试流程而不是代码来源。',
        title: '人写的代码同样会有隐蔽错误，关键是测试覆盖',
        body: '我们团队新人写的代码边界错误更多，但我们不会因此禁止新人写代码，而是要求补测试。',
        resolution: 'open',
      },
    ],
  },
  {
    type: 'claim',
    owner: 'xiaoyu',
    title: '彩礼应该由新人自己决定',
    body: '身边因为彩礼谈崩的例子越来越多，有的谈了两年最后卡在这个数字上。',
    stance: '彩礼怎么给、给多少，应该由要结婚的两个人自己决定',
    lean: 'pro',
    tags: ['情感', '社会'],
    reasons: [
      {
        by: 'xiaoyu',
        title: '婚姻的主体是新人，费用安排也该由他们承担和决定',
        body: '如果这笔钱最终由新人自己还，那么决定权也应该在他们手里。',
      },
      {
        by: 'soda',
        title: '由双方家庭谈，很容易变成一场关于面子的谈判',
        body: '一旦变成两家人的事，数字就成了攀比，和新人的实际能力脱钩。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'laozhao',
        paraphrase:
          '你的观点是「婚姻的主体是新人，费用安排也该由他们承担和决定」——钱由新人还，决定权就该在他们手里。听起来合理，但彩礼在很多地方其实是两个家庭的养老安排。',
        title: '在很多地方，彩礼是父母之间的责任交接，不只是新人的事',
        body: '女方家里收的这笔钱往往是给女儿的安全垫，不完全是面子问题。',
        resolution: 'responded',
        response: {
          title: '安全垫应该以新人共同财产的方式存在',
          body: '如果目的是保障，那放在新人共同账户里比交给女方父母更直接，也更符合保障的本意。',
        },
      },
    ],
  },
  {
    type: 'claim',
    owner: 'soda',
    title: '加班文化是被低效管理惯出来的',
    body: '我们组常年十点后下班，但季度交付量并没有比同行高。',
    stance: '多数加班不是工作量的问题，而是管理问题的外化',
    lean: 'pro',
    tags: ['职场', '公共议题'],
    reasons: [
      {
        by: 'soda',
        title: '用时长代替产出，是因为目标本身没有被拆清楚',
        body: '我们每周都在加需求，没有人判断优先级，最后只能用时间兜底。',
      },
      {
        by: 'chenmo',
        title: '决策反复导致的返工，往往比工作量本身更耗时间',
        body: '一个方案改三次方向，等于同一件事做三遍，但考核时只看到加班时长。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'laozhou',
        paraphrase:
          '你说「用时长代替产出，是因为目标本身没有被拆清楚」——每周都在加需求，没人判断优先级，只能靠时间兜底。也就是把加班都归到管理上，但有些行业确实存在周期性高峰。',
        title: '有些行业的忙季是客观存在的，不是管理问题',
        body: '做餐饮的节假日、做审计的年报季，再怎么优化也得连轴转，这跟管理水平无关。',
        resolution: 'conceded',
      },
    ],
  },
  {
    type: 'claim',
    owner: 'amay',
    title: '宠物医院的价格应该被监管',
    body: '我家猫一次肠胃炎花了两千多，账单里有一半项目看不懂。',
    stance: '宠物医疗的价格与项目应当强制公开并接受监管',
    lean: 'pro',
    tags: ['宠物', '公共议题'],
    reasons: [
      {
        by: 'amay',
        title: '信息完全不对称，主人在诊室里没有议价能力',
        body: '宠物不能说话，做什么检查完全由医院决定，主人只能签字。',
      },
      {
        by: 'zheng',
        title: '同一项目在不同医院差价过大，说明定价缺乏约束',
        body: '同样的血常规和生化，我在两家医院问到的价格差了近一倍。',
      },
    ],
    rebuttals: [
      {
        reason: 0,
        by: 'laozhao',
        paraphrase:
          '你的主张是「信息完全不对称，主人在诊室里没有议价能力」——宠物不能说话，做什么检查由医院决定，主人只能签字。因此主张监管价格，但直接限价可能会减少供给。',
        title: '限价会让原本就稀缺的宠物医生更少',
        body: '宠物医疗是自费市场，利润被压掉之后，愿意做这行的人会更少，最后受害的还是宠物。',
        resolution: 'open',
      },
    ],
  },
];

/* ---------------- 写入逻辑 ---------------- */

async function ensurePersonas() {
  const ids: Record<string, string> = {};
  for (const [key, persona] of Object.entries(PERSONAS)) {
    const authId = `seed:plaza:${key}`;
    await db
      .insert(users)
      .values({
        authId,
        displayName: persona.displayName,
        bio: persona.bio,
        courseCompletedAt: new Date(),
      })
      .onConflictDoNothing({ target: users.authId });
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.authId, authId))
      .limit(1);
    if (!row) throw new Error(`种子用户创建失败：${authId}`);
    ids[key] = row.id;
  }
  return ids;
}

async function topicExists(title: string) {
  const rows = await db.select({ id: topics.id }).from(topics).where(eq(topics.title, title)).limit(1);
  return rows.length > 0;
}

async function seedTopic(spec: TopicSpec, ids: Record<string, string>) {
  const ownerId = ids[spec.owner];
  const revealAt = spec.stakeDays ? new Date(Date.now() + spec.stakeDays * 86_400_000) : null;

  const { topic, root } = await publishTopic({
    ownerId,
    type: spec.type,
    title: spec.title,
    body: spec.body,
    stance: spec.stance,
    lean: spec.lean,
    tagNames: spec.tags,
    stakeEnabled: Boolean(spec.stakeDays),
    revealAt,
    bountyEnabled: Boolean(spec.bounty),
    allowPublicRebuttal: true,
  });

  const reasons: string[] = [];
  for (const reason of spec.reasons) {
    const outcome = await postSupport({
      topicId: topic.id,
      parentId: root.id,
      authorId: ids[reason.by],
      title: reason.title,
      body: reason.body,
    });
    if (!outcome.ok) {
      throw new Error(`支持理由未通过程序检查：${spec.title} → ${reason.title}（${outcome.error}）`);
    }
    reasons.push(outcome.claim.id);
  }

  for (const rebuttal of spec.rebuttals) {
    const targetId = reasons[rebuttal.reason];
    const targetAuthor = ids[spec.reasons[rebuttal.reason].by];
    if (!targetId) throw new Error(`反驳指向的理由不存在：${spec.title}`);

    const outcome = await postRebutal({
      topicId: topic.id,
      targetClaimId: targetId,
      authorId: ids[rebuttal.by],
      paraphrase: rebuttal.paraphrase,
      title: rebuttal.title,
      body: rebuttal.body,
    });
    if (!outcome.ok) {
      throw new Error(`反驳未通过程序检查：${spec.title} → ${rebuttal.title}（${outcome.error}）`);
    }
    const challenge = outcome.challenge;
    if (!challenge) throw new Error(`反驳没有产生挂红记录：${spec.title} → ${rebuttal.title}`);

    if (rebuttal.resolution === 'responded') {
      if (!rebuttal.response) throw new Error(`缺少回应内容：${spec.title}`);
      const responded = await respondToChallenge({
        challengeId: challenge.id,
        authorId: targetAuthor,
        title: rebuttal.response.title,
        body: rebuttal.response.body,
      });
      if (!responded.ok) {
        throw new Error(
          `回应未通过程序检查：${spec.title} → ${rebuttal.response.title}（${responded.error}）`,
        );
      }
    } else if (rebuttal.resolution === 'conceded') {
      await concedeToChallenge({ challengeId: challenge.id, actorId: targetAuthor });
    }
  }

  if (spec.conclusion) {
    // 只有一个节点在理由层时可被采纳：根立场，以及经提升通道进入理由层的子论点
    const promotedIds: string[] = [];
    for (const index of spec.conclusion.promote ?? []) {
      const claimId = reasons[index];
      if (!claimId) throw new Error(`要提升的理由不存在：${spec.title}`);
      // 只有 active / orphaned 的节点允许迁移：被反驳过或已回应的节点留在原位，
      // 结论书此时只采纳根立场（产品上也是这条规则）。
      const [row] = await db
        .select({ status: claims.status })
        .from(claims)
        .where(eq(claims.id, claimId))
        .limit(1);
      if (!row || !['active', 'orphaned'].includes(row.status)) {
        console.log(
          `[seed] 跳过一次理由层提升（当前状态 ${row?.status ?? 'unknown'}）：${spec.title}`,
        );
        continue;
      }
      await promoteClaimToReasonLayer({ claimId, actorId: ids[spec.reasons[index].by] });
      promotedIds.push(claimId);
    }

    const openChallenges = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(and(eq(challenges.topicId, topic.id), eq(challenges.status, 'open')));
    await publishConclusion({
      topicId: topic.id,
      actorId: ownerId,
      verdictText: spec.conclusion.verdict,
      recommendationText: spec.conclusion.recommendation,
      premises: spec.conclusion.premises,
      adoptedClaimIds: [root.id, ...promotedIds],
      acknowledgedChallengeIds: spec.conclusion.acknowledgeOpen
        ? openChallenges.map((row) => row.id)
        : [],
    });
  }

  for (const prediction of spec.predictions ?? []) {
    try {
      await placePrediction({
        topicId: topic.id,
        bettorId: ids[prediction.by],
        statement: prediction.statement,
        predictedOutcome: prediction.predictedOutcome,
      });
    } catch (error) {
      console.warn(
        `[seed] 立帖为证跳过：${spec.title} / ${PERSONAS[prediction.by].displayName} → ${(error as Error).message}`,
      );
    }
  }

  const flags = [
    spec.conclusion ? '结案' : '进行中',
    spec.rebuttals.some((row) => row.resolution === 'conceded') ? '含击穿' : null,
    spec.stakeDays ? '立帖为证' : null,
  ].filter(Boolean);
  console.log(`[seed] ${spec.title}（${flags.join(' / ')}）`);
}

export async function main() {
  const ids = await ensurePersonas();
  let created = 0;
  let skipped = 0;

  for (const spec of TOPICS) {
    if (await topicExists(spec.title)) {
      skipped += 1;
      continue;
    }
    await seedTopic(spec, ids);
    created += 1;
  }

  console.log(`\n[seed] 完成：新建 ${created} 个话题，跳过 ${skipped} 个已存在话题，共 ${TOPICS.length} 个。`);
}
