/**
 * 营销海报 - AI 文案生成 + 数据准备
 */
import { DashScope } from './qwen';

export interface PosterActivity {
  name: string;
  description: string;
  imageUrl?: string;
  type: 'visit' | 'teach';
  timeLabel: string;
}

export interface PosterDayData {
  day: number;
  morning: PosterActivity[];
  afternoon: PosterActivity[];
}

export interface PosterServiceInfo {
  name: string;
  type: 'hotel' | 'restaurant';
  description: string;
  imageUrl?: string;
}

export interface PosterData {
  projectName: string;
  clientName: string;
  participants: number;
  days: number;
  slogan: string;
  highlights: string[];
  daysData: PosterDayData[];
  hotelInfo?: PosterServiceInfo;
  restaurants: PosterServiceInfo[];
}

// ─── 供应商查找工具（支持模糊匹配） ───
function findSupplierByName(suppliers: any[], name: string): any {
  // 精确匹配
  let result = suppliers.find((s) => s.name === name);
  if (result) return result;

  // 去除空格后匹配
  const trimmed = name.replace(/\s/g, '');
  result = suppliers.find((s) => s.name.replace(/\s/g, '') === trimmed);
  if (result) return result;

  // 包含匹配（AI 可能在名称前后加了文字）
  result = suppliers.find((s) => name.includes(s.name) || s.name.includes(name));
  return result;
}

// ─── AI 文案生成 ───
export async function generatePosterCopy(
  schedule: any[],
  suppliers: any[],
  hotelArrangement: any,
  projectName: string,
  clientName: string,
  participants: number,
  days: number
): Promise<PosterData> {
  const ai = new DashScope();

  // 收集所有餐厅
  const restaurantSet = new Set<string>();
  const restaurantIds: string[] = [];
  schedule.forEach((day: any) => {
    [day.noon, day.evening].forEach((meal: any) => {
      if (meal?.supplierId && !restaurantSet.has(meal.supplierId)) {
        restaurantSet.add(meal.supplierId);
        restaurantIds.push(meal.supplierId);
      }
    });
  });

  const hotelSupplier = suppliers.find((s: any) => s.id === hotelArrangement?.hotelId);
  const hotelContext = hotelSupplier
    ? `酒店：${hotelSupplier.name}（${hotelArrangement.nights}晚，每间${hotelArrangement.peoplePerRoom}人）`
    : '酒店：未指定';

  const restaurantNames = restaurantIds
    .map((id) => suppliers.find((s: any) => s.id === id)?.name || '未指定')
    .join('、');

  // 构建每日行程
  const scheduleDetail = schedule.map((day: any) => {
    const morningActs = (day.morning || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      const name = supplier?.name || '未指定';
      if (act.type === 'visit') return `参访：${name}`;
      return `课程：${name} - ${act.courseName || '未指定'}（${act.hours || 0}课时）`;
    }).join('；') || '休息';

    const afternoonActs = (day.afternoon || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      const name = supplier?.name || '未指定';
      if (act.type === 'visit') return `参访：${name}`;
      return `课程：${name} - ${act.courseName || '未指定'}（${act.hours || 0}课时）`;
    }).join('；') || '休息';

    return `第${day.day}天\n  上午：${morningActs}\n  下午：${afternoonActs}`;
  }).join('\n\n');

  // 列出所有需要 AI 描述的供应商名称（帮助 AI 准确使用名称）
  const activitySupplierNames = (() => {
    const names: string[] = [];
    const seen = new Set<string>();
    schedule.forEach((day: any) => {
      [...day.morning, ...day.afternoon].forEach((act: any) => {
        const supplier = suppliers.find((s: any) => s.id === act.supplierId);
        if (supplier && !seen.has(supplier.name)) {
          seen.add(supplier.name);
          names.push(supplier.name);
        }
      });
    });
    return names.length > 0 ? `行程中涉及的供应商名称（请严格使用以下名称，不要修改）：${names.join('、')}` : '';
  })();

  const prompt = `你是一个专业的游学/培训项目营销文案策划师。根据以下行程信息，为营销海报生成文案。

项目名称：${projectName}
客户名称：${clientName}
参访人数：${participants}人
天数：${days}天

酒店安排：${hotelContext}
餐饮安排：${restaurantNames || '未安排'}

详细行程：
${scheduleDetail}

${activitySupplierNames}

请严格按以下JSON格式输出（不要包含markdown代码块标记）：
{
  "slogan": "一句有冲击力的营销标语，15字以内",
  "highlights": [
    "亮点1：30字以内，概括行程核心价值",
    "亮点2：30字以内",
    "亮点3：30字以内",
    "亮点4：30字以内"
  ],
  "days": [
    {
      "day": 1,
      "morning": [
        {
          "name": "供应商名称（必须严格使用上面列出的名称）",
          "description": "50-100字的正式行程描述，像旅游方案一样介绍这个参访点/课程的特色、亮点和价值"
        }
      ],
      "afternoon": [
        {
          "name": "供应商名称",
          "description": "50-100字的正式行程描述"
        }
      ]
    }
  ],
  "hotelDescription": "20-40字的酒店介绍，突出舒适度和特色",
  "restaurantDescriptions": [
    {"name": "餐厅名称（必须严格使用上面列出的名称）", "description": "15-30字的餐厅介绍"}
  ]
}

要求：
1. slogan 要有冲击力，适合做海报主标语
2. highlights 概括整个行程的核心亮点，每条不超过30字
3. 每个活动的 description 写50-100字，正式介绍这个行程点的特色和价值
4. name 字段必须严格使用上面列出的供应商名称，不要添加或删除文字
5. 每天都要有 morning 和 afternoon，即使没有安排也保留空数组
6. restaurantDescriptions 中的 name 必须和上面列出的餐厅名称完全一致`;

  try {
    const response = await ai.call({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: '你是专业的营销文案策划师。请直接输出JSON，不要输出其他内容。' },
        { role: 'user', content: prompt },
      ],
    });

    const text = response.output?.text || '';
    console.log('[Poster AI] 原始回复:', text);

    let parsed: any;
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    } catch {
      console.warn('[Poster AI] 解析失败，使用默认文案');
      parsed = generateFallbackCopy(schedule, suppliers, projectName, clientName, hotelArrangement, hotelSupplier);
    }

    // 构建海报数据
    const daysData: PosterDayData[] = (parsed.days || []).map((dayData: any) => {
      const scheduleDay = schedule.find((s: any) => s.day === dayData.day);
      const morning = (dayData.morning || []).map((a: any, i: number) => {
        const scheduleMorning = scheduleDay?.morning?.[i];
        const supplier = findSupplierByName(suppliers, a.name);
        console.log('[Poster] 查找供应商:', a.name, '→', supplier?.name || '(未找到)', supplier?.image_url ? '(有图片)' : '(无图片)');
        return {
          name: a.name,
          description: a.description,
          imageUrl: supplier?.image_url,
          type: scheduleMorning?.type || 'visit',
          timeLabel: 'AM',
        };
      });
      const afternoon = (dayData.afternoon || []).map((a: any, i: number) => {
        const scheduleAfternoon = scheduleDay?.afternoon?.[i];
        const supplier = findSupplierByName(suppliers, a.name);
        console.log('[Poster] 查找供应商:', a.name, '→', supplier?.name || '(未找到)', supplier?.image_url ? '(有图片)' : '(无图片)');
        return {
          name: a.name,
          description: a.description,
          imageUrl: supplier?.image_url,
          type: scheduleAfternoon?.type || 'visit',
          timeLabel: 'PM',
        };
      });
      return { day: dayData.day, morning, afternoon };
    });

    const hotelInfo: PosterServiceInfo | undefined = hotelSupplier
      ? {
          name: hotelSupplier.name,
          type: 'hotel',
          description: parsed.hotelDescription || `${hotelSupplier.name}，舒适入住${hotelArrangement.nights}晚`,
          imageUrl: hotelSupplier.image_url,
        }
      : undefined;

    const restaurants: PosterServiceInfo[] = (parsed.restaurantDescriptions || []).map((r: any) => {
      const supplier = findSupplierByName(suppliers, r.name);
      return {
        name: r.name,
        type: 'restaurant',
        description: r.description,
        imageUrl: supplier?.image_url,
      };
    });

    return {
      projectName,
      clientName,
      participants,
      days,
      slogan: parsed.slogan || `${projectName} · ${clientName}`,
      highlights: parsed.highlights || [],
      daysData,
      hotelInfo,
      restaurants,
    };
  } catch (error) {
    console.error('[Poster AI] 生成失败:', error);
    const fallback = generateFallbackCopy(schedule, suppliers, projectName, clientName, hotelArrangement, hotelSupplier);
    return {
      projectName,
      clientName,
      participants,
      days,
      slogan: fallback.slogan,
      highlights: fallback.highlights,
      daysData: fallback.days,
      hotelInfo: fallback.hotelInfo,
      restaurants: fallback.restaurants,
    };
  }
}

// ─── 降级方案 ───
function generateFallbackCopy(
  schedule: any[],
  suppliers: any[],
  projectName: string,
  clientName: string,
  hotelArrangement: any,
  hotelSupplier: any
) {
  const days = schedule.map((day: any) => {
    const morning = (day.morning || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      return {
        name: supplier?.name || '参访点',
        description: act.type === 'visit' ? '走进行业领军企业，近距离感受创新文化和管理模式，深入了解企业发展历程与核心业务。' : `专业课程：${act.courseName || '未指定'}，系统学习实用知识，提升实战能力。`,
        imageUrl: supplier?.image_url,
        type: act.type,
        timeLabel: 'AM',
      };
    });
    const afternoon = (day.afternoon || []).map((act: any) => {
      const supplier = suppliers.find((s: any) => s.id === act.supplierId);
      return {
        name: supplier?.name || '参访点',
        description: act.type === 'visit' ? '走进行业领军企业，近距离感受创新文化和管理模式，深入了解企业发展历程与核心业务。' : `专业课程：${act.courseName || '未指定'}，系统学习实用知识，提升实战能力。`,
        imageUrl: supplier?.image_url,
        type: act.type,
        timeLabel: 'PM',
      };
    });
    return { day: day.day, morning, afternoon };
  });

  // 收集餐厅
  const restaurantSet = new Set<string>();
  const restaurants: any[] = [];
  schedule.forEach((day: any) => {
    [day.noon, day.evening].forEach((meal: any) => {
      if (meal?.supplierId && !restaurantSet.has(meal.supplierId)) {
        restaurantSet.add(meal.supplierId);
        const r = suppliers.find((s: any) => s.id === meal.supplierId);
        if (r) {
          restaurants.push({
            name: r.name,
            type: 'restaurant',
            description: '精选当地特色餐饮，品味地道风味。',
            imageUrl: r.image_url,
          });
        }
      }
    });
  });

  const hotelInfo = hotelSupplier
    ? {
        name: hotelSupplier.name,
        type: 'hotel',
        description: `舒适入住${hotelArrangement.nights}晚，享受优质住宿体验。`,
        imageUrl: hotelSupplier.image_url,
      }
    : undefined;

  return {
    slogan: `${projectName} · ${clientName}参访之旅`,
    highlights: ['精选优质参访点', '专业课程赋能', '全方位服务体验'],
    days,
    hotelInfo,
    restaurants,
  };
}
